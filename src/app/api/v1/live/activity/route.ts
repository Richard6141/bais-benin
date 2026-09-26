import { NextResponse, type NextRequest } from "next/server";
import { getApiActor } from "@/features/auth/api-actor";
import { logger } from "@/lib/logger";
import { LIVE_ACTIVITY_LIMIT, liveContext, readActivity } from "@/modules/live";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Fil d'activité en direct, en flux d'événements serveur (text/event-stream) : au branchement, les
// faits de la dernière heure ; ensuite, toutes les POLL_MS, ce qui est arrivé depuis. Le flux se
// ferme de lui-même après STREAM_MS : EventSource se reconnecte seul, en renvoyant le dernier
// identifiant reçu, ce qui évite de garder une fonction ouverte indéfiniment.

const POLL_MS = 3_000;
const HEARTBEAT_MS = 15_000;
const STREAM_MS = 4 * 60_000;
const BACKLOG_MS = 60 * 60_000;

function encodeEvent(event: string, data: unknown, id?: string): string {
  return `${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Reprise après reconnexion : l'identifiant d'événement est l'heure du dernier fait envoyé. */
function resumeFrom(request: NextRequest, now: number): Date {
  const lastId = request.headers.get("last-event-id");
  const parsed = lastId ? Date.parse(lastId) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > now - BACKLOG_MS) return new Date(parsed);
  return new Date(now - BACKLOG_MS);
}

export async function GET(request: NextRequest) {
  const api = await getApiActor(request.headers);
  if (!api) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  const context = await liveContext(api.actor);
  if (!context) return NextResponse.json({ error: "Fil réservé" }, { status: 403 });

  const encoder = new TextEncoder();
  let since = resumeFrom(request, Date.now());
  let closed = false;
  // Le premier envoi (« backlog ») rattrape l'heure écoulée ; les suivants sont des nouveautés.
  // Après une reconnexion, le rattrapage ne contient que des faits encore jamais envoyés.
  let initial = !request.headers.get("last-event-id");
  const timers: ReturnType<typeof setTimeout>[] = [];

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        for (const timer of timers) clearTimeout(timer);
        controller.close();
      };
      const poll = async () => {
        if (closed) return;
        try {
          const items = await readActivity(context, since, LIVE_ACTIVITY_LIMIT);
          if (items.length > 0) {
            since = new Date(items[0]!.at);
            send(encodeEvent(initial ? "backlog" : "activity", items, items[0]!.at));
          }
          initial = false;
        } catch (error) {
          logger.warn({ err: error }, "Fil d'activité : lecture impossible");
        }
        if (!closed) timers.push(setTimeout(poll, POLL_MS));
      };
      const heartbeat = () => {
        send(": maintien\n\n");
        if (!closed) timers.push(setTimeout(heartbeat, HEARTBEAT_MS));
      };
      send(`retry: ${POLL_MS}\n\n`);
      send(encodeEvent("ready", { audience: context.audience }));
      void poll();
      timers.push(setTimeout(heartbeat, HEARTBEAT_MS));
      timers.push(setTimeout(close, STREAM_MS));
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      closed = true;
      for (const timer of timers) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
