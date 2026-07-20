import { cookies } from "next/headers";
import { getServerClient } from "@/lib/supabase-server";
import { loginAdmin, logoutAdmin } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const isAdmin = cookieStore.get("gg_admin_token")?.value === "true";

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <form action={loginAdmin} className="flex flex-col gap-4 p-8 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-sm">
          <h1 className="text-xl font-bold text-white text-center">Admin Access</h1>
          <input
            type="password"
            name="password"
            placeholder="Enter Admin Password"
            className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-500"
            required
          />
          <button type="submit" className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors">
            Login
          </button>
        </form>
      </div>
    );
  }

  const supabase = getServerClient();
  let traces: any[] = [];
  let errorMsg = null;

  if (supabase) {
    // Fetch unique trace_ids ordered by most recent event
    const { data, error } = await supabase
      .from("trace_events")
      .select("trace_id, created_at, event_type, message, latency_ms, metadata")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      errorMsg = error.message;
    } else if (data) {
      // Group by trace_id
      const grouped = new Map<string, any[]>();
      for (const row of data) {
        if (!grouped.has(row.trace_id)) {
          grouped.set(row.trace_id, []);
        }
        grouped.get(row.trace_id)!.push(row);
      }
      
      traces = Array.from(grouped.entries()).map(([traceId, events]) => {
        // Events are descending, we want to sort them ascending within a trace
        events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return {
          traceId,
          events,
          startTime: events[0]?.created_at,
          totalLatencyMs: events.reduce((sum, e) => sum + (e.latency_ms || 0), 0),
        };
      });
      // Sort traces by start time descending
      traces.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    }
  } else {
    errorMsg = "Supabase client not available";
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-white p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trace Dashboard</h1>
            <p className="text-zinc-400 mt-1">Granular backend observability</p>
          </div>
          <form action={logoutAdmin}>
            <button type="submit" className="px-4 py-2 text-sm border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors">
              Logout
            </button>
          </form>
        </header>

        {errorMsg && (
          <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200 mb-8">
            Error loading traces: {errorMsg}
          </div>
        )}

        <div className="space-y-6">
          {traces.length === 0 && !errorMsg && (
            <div className="text-center p-12 border border-zinc-800 border-dashed rounded-xl text-zinc-500">
              No traces found in the database.
            </div>
          )}
          
          {traces.map((trace) => (
            <details key={trace.traceId} className="group border border-zinc-800 bg-zinc-900/50 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors select-none">
                <div className="flex items-center gap-4">
                  <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold group-open:rotate-90 transition-transform">
                    ▶
                  </div>
                  <div>
                    <div className="font-mono text-sm text-zinc-300">{trace.traceId}</div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {new Date(trace.startTime).toLocaleString()} • {trace.events.length} events • {trace.totalLatencyMs}ms total latency
                    </div>
                  </div>
                </div>
              </summary>
              
              <div className="border-t border-zinc-800 p-0 overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-zinc-950/50 text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                      <th className="px-4 py-3 font-medium">Time</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Message</th>
                      <th className="px-4 py-3 font-medium">Latency</th>
                      <th className="px-4 py-3 font-medium w-full">Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50 text-sm">
                    {trace.events.map((event: any) => (
                      <tr key={event.id} className="hover:bg-zinc-800/20 transition-colors">
                        <td className="px-4 py-3 text-zinc-400">
                          {new Date(event.created_at).toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 3 })}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-zinc-800 rounded-md text-xs font-medium text-zinc-300">
                            {event.event_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-zinc-200">
                          {event.message}
                        </td>
                        <td className="px-4 py-3 text-zinc-400">
                          {event.latency_ms ? `${event.latency_ms}ms` : "-"}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-zinc-500 max-w-md truncate hover:whitespace-normal hover:text-zinc-300 transition-all cursor-help" title={JSON.stringify(event.metadata, null, 2)}>
                          {event.metadata ? JSON.stringify(event.metadata) : "{}"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
