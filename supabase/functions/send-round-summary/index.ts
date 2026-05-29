import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface HoleScore {
  strokes: number;
  putts?: number;
}

interface HoleDef {
  number: number;
  par: number;
  yards: number;
}

interface RoundSummaryPayload {
  email: string;
  courseName: string;
  date: string;
  players: string[];
  holes: HoleDef[];
  scores: Record<string, Record<string, HoleScore>>;
}

function buildEmailHtml(payload: RoundSummaryPayload): string {
  const { courseName, date, players, holes, scores } = payload;

  const playerKeys = ["p1", "p2", "p3", "p4"].slice(0, players.length);
  const totalPar = holes.reduce((s, h) => s + h.par, 0);

  const playerTotals = playerKeys.map((pk) => {
    const playerScores = scores[pk] || {};
    return Object.values(playerScores).reduce((s, h) => s + (h.strokes || 0), 0);
  });

  // Per-player stats
  const playerStats = playerKeys.map((pk) => {
    let birdies = 0, pars = 0, bogeys = 0, doubles = 0, worse = 0, holesPlayed = 0;
    holes.forEach((h) => {
      const s = scores[pk]?.[String(h.number)]?.strokes;
      if (!s) return;
      holesPlayed++;
      const d = s - h.par;
      if (d <= -1) birdies++;
      else if (d === 0) pars++;
      else if (d === 1) bogeys++;
      else if (d === 2) doubles++;
      else worse++;
    });
    const total = playerTotals[playerKeys.indexOf(pk)];
    const avg = holesPlayed > 0 ? (total / holesPlayed).toFixed(1) : "-";
    return { birdies, pars, bogeys, doubles, worse, holesPlayed, avg };
  });

  const holeRows = holes
    .map((h) => {
      const cells = playerKeys
        .map((pk) => {
          const s = scores[pk]?.[String(h.number)]?.strokes || 0;
          const diff = s - h.par;
          const color = s === 0 ? "#6b7280" : diff < 0 ? "#16a34a" : diff > 0 ? "#dc2626" : "#e5e7eb";
          return `<td style="padding:6px 10px;text-align:center;color:${color};font-weight:600;">${s || "-"}</td>`;
        })
        .join("");
      return `<tr style="border-bottom:1px solid #1f2937;">
        <td style="padding:6px 10px;font-weight:700;color:#e5e7eb;">${h.number}</td>
        <td style="padding:6px 10px;color:#9ca3af;">${h.par}</td>
        <td style="padding:6px 10px;color:#9ca3af;">${h.yards}y</td>
        ${cells}
      </tr>`;
    })
    .join("");

  const headerCells = players
    .map((name) => `<th style="padding:6px 10px;color:#c8960c;font-size:12px;">${name}</th>`)
    .join("");

  const totalCells = playerTotals
    .map((t) => {
      if (t === 0) return `<td style="padding:8px 10px;text-align:center;color:#6b7280;">-</td>`;
      const diff = t - totalPar;
      const label = diff === 0 ? "E" : diff > 0 ? `+${diff}` : String(diff);
      return `<td style="padding:8px 10px;text-align:center;font-weight:700;color:#fff;">${t} (${label})</td>`;
    })
    .join("");

  // Stats section
  const statsRows = playerKeys.map((pk, i) => {
    const s = playerStats[i];
    return `<tr style="border-bottom:1px solid #1f2937;">
      <td style="padding:6px 10px;color:#c8960c;font-weight:600;">${players[i]}</td>
      <td style="padding:6px 10px;text-align:center;color:#16a34a;">${s.birdies}</td>
      <td style="padding:6px 10px;text-align:center;color:#e5e7eb;">${s.pars}</td>
      <td style="padding:6px 10px;text-align:center;color:#f97316;">${s.bogeys}</td>
      <td style="padding:6px 10px;text-align:center;color:#dc2626;">${s.doubles + s.worse}</td>
      <td style="padding:6px 10px;text-align:center;color:#9ca3af;">${s.avg}</td>
    </tr>`;
  }).join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:20px;background:#050e1a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#0f2444;border-radius:12px;overflow:hidden;border:1px solid #1e3a5f;">
    <div style="padding:24px 20px;text-align:center;border-bottom:1px solid #1e3a5f;">
      <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:2px;">VetField Golf</h1>
      <p style="margin:4px 0 0;color:#c8960c;font-size:13px;letter-spacing:3px;">ROUND SUMMARY</p>
    </div>
    <div style="padding:20px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
        <div>
          <div style="color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Course</div>
          <div style="color:#fff;font-size:16px;font-weight:700;margin-top:2px;">${courseName}</div>
        </div>
        <div style="text-align:right;">
          <div style="color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Date</div>
          <div style="color:#fff;font-size:14px;margin-top:2px;">${date}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;background:#0a1a30;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#0d2240;border-bottom:2px solid #1e3a5f;">
            <th style="padding:8px 10px;color:#6b7280;text-align:left;font-size:11px;">HOLE</th>
            <th style="padding:8px 10px;color:#6b7280;font-size:11px;">PAR</th>
            <th style="padding:8px 10px;color:#6b7280;font-size:11px;">YDS</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>
          ${holeRows}
          <tr style="background:#0d2240;border-top:2px solid #c8960c;">
            <td style="padding:8px 10px;font-weight:700;color:#c8960c;" colspan="2">TOTAL</td>
            <td style="padding:8px 10px;color:#9ca3af;">${totalPar}</td>
            ${totalCells}
          </tr>
        </tbody>
      </table>
      <div style="margin-top:16px;">
        <div style="color:#c8960c;font-size:11px;letter-spacing:1px;margin-bottom:8px;font-weight:700;">ROUND STATS</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;background:#0a1a30;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#0d2240;">
              <th style="padding:6px 10px;color:#6b7280;text-align:left;font-size:10px;">PLAYER</th>
              <th style="padding:6px 10px;color:#6b7280;font-size:10px;">BRD</th>
              <th style="padding:6px 10px;color:#6b7280;font-size:10px;">PAR</th>
              <th style="padding:6px 10px;color:#6b7280;font-size:10px;">BGY</th>
              <th style="padding:6px 10px;color:#6b7280;font-size:10px;">DBL+</th>
              <th style="padding:6px 10px;color:#6b7280;font-size:10px;">AVG</th>
            </tr>
          </thead>
          <tbody>${statsRows}</tbody>
        </table>
      </div>
      <div style="margin-top:20px;padding:12px;background:rgba(200,150,12,0.08);border:1px solid rgba(200,150,12,0.2);border-radius:8px;text-align:center;">
        <div style="color:#c8960c;font-size:11px;letter-spacing:1px;">POWERED BY VETFIELD SMARTCART</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const payload: RoundSummaryPayload = await req.json();

    if (!payload.email) {
      return new Response(JSON.stringify({ error: "Email address required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save round to database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let userId: string | null = null;
    const token = authHeader.replace("Bearer ", "");
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const playerKeys = ["p1", "p2", "p3", "p4"].slice(0, payload.players.length);
    const totals = playerKeys.map((pk) => {
      const playerScores = payload.scores[pk] || {};
      return Object.values(playerScores).reduce((s: number, h: HoleScore) => s + (h.strokes || 0), 0);
    });

    let saved = false;
    if (userId) {
      const { error: dbErr } = await supabase.from("round_summaries").insert({
        user_id: userId,
        course_name: payload.courseName,
        round_date: payload.date,
        players: payload.players,
        holes: payload.holes,
        scores: payload.scores,
        totals,
      });
      saved = !dbErr;
    }

    // Send email via Resend
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    let emailSent = false;
    let emailError: string | null = null;

    if (RESEND_API_KEY) {
      const html = buildEmailHtml(payload);

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "VetField Golf <onboarding@resend.dev>",
          to: [payload.email],
          subject: `Round Summary - ${payload.courseName} (${payload.date})`,
          html,
        }),
      });

      if (res.ok) {
        emailSent = true;
      } else {
        emailError = await res.text();
      }
    } else {
      emailError = "Email service not configured";
    }

    return new Response(
      JSON.stringify({ success: true, saved, emailSent, emailError: emailSent ? null : emailError }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
