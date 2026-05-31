import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
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

interface ShotRow {
  hole: number;
  shot_index: number;
  player_key: string;
  distance_yards: number;
  cart_lat: number | null;
  cart_lng: number | null;
  cart_heading_deg: number | null;
}

interface RoundPayload {
  roundId: string;
  email: string;
  courseName: string;
  date: string;
  players: string[];
  holes: HoleDef[];
  scores: Record<string, Record<string, HoleScore>>;
}

function haversineYards(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c) * 1.09361;
}

function computeCartStats(shots: ShotRow[], holes: HoleDef[]) {
  const cartPoints = shots.filter((s) => s.cart_lat && s.cart_lng);
  if (cartPoints.length < 2) return null;

  let totalDistanceYards = 0;
  const sortedShots = [...cartPoints].sort(
    (a, b) => a.hole - b.hole || a.shot_index - b.shot_index
  );

  for (let i = 1; i < sortedShots.length; i++) {
    const prev = sortedShots[i - 1];
    const curr = sortedShots[i];
    if (prev.cart_lat && prev.cart_lng && curr.cart_lat && curr.cart_lng) {
      totalDistanceYards += haversineYards(
        prev.cart_lat,
        prev.cart_lng,
        curr.cart_lat,
        curr.cart_lng
      );
    }
  }

  const holesWithCart = new Set(cartPoints.map((s) => s.hole));
  const perHole: Record<number, number> = {};
  for (const hole of holesWithCart) {
    const holeShots = sortedShots.filter((s) => s.hole === hole);
    let holeDist = 0;
    for (let i = 1; i < holeShots.length; i++) {
      const prev = holeShots[i - 1];
      const curr = holeShots[i];
      if (prev.cart_lat && prev.cart_lng && curr.cart_lat && curr.cart_lng) {
        holeDist += haversineYards(
          prev.cart_lat,
          prev.cart_lng,
          curr.cart_lat,
          curr.cart_lng
        );
      }
    }
    perHole[hole] = Math.round(holeDist);
  }

  return {
    totalDistanceYards: Math.round(totalDistanceYards),
    totalDistanceMiles: (totalDistanceYards / 1760).toFixed(1),
    holesTracked: holesWithCart.size,
    totalHoles: holes.length,
    perHole,
  };
}

function buildEmailHtml(
  payload: RoundPayload,
  cartStats: ReturnType<typeof computeCartStats>,
  shotStats: { totalShots: number; avgDistance: number; longestShot: number }
) {
  const { courseName, date, players, holes, scores } = payload;
  const playerKeys = ["p1", "p2", "p3", "p4"].slice(0, players.length);
  const totalPar = holes.reduce((s, h) => s + h.par, 0);

  const playerTotals = playerKeys.map((pk) => {
    const ps = scores[pk] || {};
    return Object.values(ps).reduce((s, h) => s + (h.strokes || 0), 0);
  });

  const playerStats = playerKeys.map((pk) => {
    let birdies = 0,
      pars = 0,
      bogeys = 0,
      doubles = 0,
      holesPlayed = 0;
    holes.forEach((h) => {
      const s = scores[pk]?.[String(h.number)]?.strokes;
      if (!s) return;
      holesPlayed++;
      const d = s - h.par;
      if (d <= -1) birdies++;
      else if (d === 0) pars++;
      else if (d === 1) bogeys++;
      else doubles++;
    });
    const total = playerTotals[playerKeys.indexOf(pk)];
    const scoringAvg =
      holesPlayed > 0 ? (total / holesPlayed).toFixed(1) : "-";
    return { birdies, pars, bogeys, doubles, holesPlayed, scoringAvg };
  });

  const holeRows = holes
    .map((h) => {
      const cells = playerKeys
        .map((pk) => {
          const s = scores[pk]?.[String(h.number)]?.strokes || 0;
          const diff = s - h.par;
          const color =
            s === 0
              ? "#6b7280"
              : diff < 0
              ? "#16a34a"
              : diff > 0
              ? "#dc2626"
              : "#e5e7eb";
          return `<td style="padding:6px 10px;text-align:center;color:${color};font-weight:600;">${s || "-"}</td>`;
        })
        .join("");
      const cartCell = cartStats?.perHole[h.number]
        ? `<td style="padding:6px 10px;text-align:center;color:#60a5fa;font-size:11px;">${cartStats.perHole[h.number]}y</td>`
        : `<td style="padding:6px 10px;text-align:center;color:#374151;">-</td>`;
      return `<tr style="border-bottom:1px solid #1f2937;">
        <td style="padding:6px 10px;font-weight:700;color:#e5e7eb;">${h.number}</td>
        <td style="padding:6px 10px;color:#9ca3af;">${h.par}</td>
        <td style="padding:6px 10px;color:#9ca3af;">${h.yards}y</td>
        ${cells}
        ${cartCell}
      </tr>`;
    })
    .join("");

  const headerCells = players
    .map(
      (name) =>
        `<th style="padding:6px 10px;color:#c8960c;font-size:12px;">${name}</th>`
    )
    .join("");

  const totalCells = playerTotals
    .map((t) => {
      if (t === 0)
        return `<td style="padding:8px 10px;text-align:center;color:#6b7280;">-</td>`;
      const diff = t - totalPar;
      const label = diff === 0 ? "E" : diff > 0 ? `+${diff}` : String(diff);
      return `<td style="padding:8px 10px;text-align:center;font-weight:700;color:#fff;">${t} (${label})</td>`;
    })
    .join("");

  const statsRows = playerKeys
    .map((_, i) => {
      const s = playerStats[i];
      return `<tr style="border-bottom:1px solid #1f2937;">
        <td style="padding:8px 10px;color:#c8960c;font-weight:600;">${players[i]}</td>
        <td style="padding:8px 10px;text-align:center;color:#16a34a;font-weight:600;">${s.birdies}</td>
        <td style="padding:8px 10px;text-align:center;color:#e5e7eb;font-weight:600;">${s.pars}</td>
        <td style="padding:8px 10px;text-align:center;color:#f97316;font-weight:600;">${s.bogeys}</td>
        <td style="padding:8px 10px;text-align:center;color:#dc2626;font-weight:600;">${s.doubles}</td>
        <td style="padding:8px 10px;text-align:center;color:#9ca3af;font-weight:600;">${s.scoringAvg}</td>
      </tr>`;
    })
    .join("");

  const cartSection = cartStats
    ? `<div style="margin-top:20px;">
        <div style="color:#60a5fa;font-size:11px;letter-spacing:2px;font-weight:700;margin-bottom:8px;">CART USAGE</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;background:#0a1a30;border-radius:8px;overflow:hidden;">
          <tr style="border-bottom:1px solid #1f2937;">
            <td style="padding:10px;color:#9ca3af;">Total Distance</td>
            <td style="padding:10px;text-align:right;color:#fff;font-weight:700;">${cartStats.totalDistanceMiles} mi (${cartStats.totalDistanceYards.toLocaleString()} yds)</td>
          </tr>
          <tr style="border-bottom:1px solid #1f2937;">
            <td style="padding:10px;color:#9ca3af;">Holes Tracked</td>
            <td style="padding:10px;text-align:right;color:#fff;font-weight:700;">${cartStats.holesTracked} / ${cartStats.totalHoles}</td>
          </tr>
          <tr style="border-bottom:1px solid #1f2937;">
            <td style="padding:10px;color:#9ca3af;">Avg Per Hole</td>
            <td style="padding:10px;text-align:right;color:#fff;font-weight:700;">${cartStats.holesTracked > 0 ? Math.round(cartStats.totalDistanceYards / cartStats.holesTracked) : 0} yds</td>
          </tr>
        </table>
      </div>`
    : "";

  const shotSection = shotStats.totalShots > 0
    ? `<div style="margin-top:20px;">
        <div style="color:#34d399;font-size:11px;letter-spacing:2px;font-weight:700;margin-bottom:8px;">SHOT TRACKING</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;background:#0a1a30;border-radius:8px;overflow:hidden;">
          <tr style="border-bottom:1px solid #1f2937;">
            <td style="padding:10px;color:#9ca3af;">Total Shots Tracked</td>
            <td style="padding:10px;text-align:right;color:#fff;font-weight:700;">${shotStats.totalShots}</td>
          </tr>
          <tr style="border-bottom:1px solid #1f2937;">
            <td style="padding:10px;color:#9ca3af;">Avg Shot Distance</td>
            <td style="padding:10px;text-align:right;color:#fff;font-weight:700;">${shotStats.avgDistance} yds</td>
          </tr>
          <tr>
            <td style="padding:10px;color:#9ca3af;">Longest Shot</td>
            <td style="padding:10px;text-align:right;color:#fff;font-weight:700;">${shotStats.longestShot} yds</td>
          </tr>
        </table>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:20px;background:#050e1a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#0f2444;border-radius:12px;overflow:hidden;border:1px solid #1e3a5f;">
    <div style="padding:24px 20px;text-align:center;border-bottom:1px solid #1e3a5f;">
      <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:2px;">VetField Golf</h1>
      <p style="margin:4px 0 0;color:#c8960c;font-size:13px;letter-spacing:3px;">ROUND STATS</p>
    </div>
    <div style="padding:20px;">
      <table style="width:100%;margin-bottom:16px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;">
            <div style="color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Course</div>
            <div style="color:#fff;font-size:16px;font-weight:700;margin-top:2px;">${courseName}</div>
          </td>
          <td style="vertical-align:top;text-align:right;">
            <div style="color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Date</div>
            <div style="color:#fff;font-size:14px;margin-top:2px;">${date}</div>
          </td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:13px;background:#0a1a30;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#0d2240;border-bottom:2px solid #1e3a5f;">
            <th style="padding:8px 10px;color:#6b7280;text-align:left;font-size:11px;">HOLE</th>
            <th style="padding:8px 10px;color:#6b7280;font-size:11px;">PAR</th>
            <th style="padding:8px 10px;color:#6b7280;font-size:11px;">YDS</th>
            ${headerCells}
            <th style="padding:8px 10px;color:#60a5fa;font-size:11px;">CART</th>
          </tr>
        </thead>
        <tbody>
          ${holeRows}
          <tr style="background:#0d2240;border-top:2px solid #c8960c;">
            <td style="padding:8px 10px;font-weight:700;color:#c8960c;" colspan="2">TOTAL</td>
            <td style="padding:8px 10px;color:#9ca3af;">${totalPar}</td>
            ${totalCells}
            <td style="padding:8px 10px;text-align:center;color:#60a5fa;font-weight:700;">${cartStats ? cartStats.totalDistanceMiles + "mi" : "-"}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top:20px;">
        <div style="color:#c8960c;font-size:11px;letter-spacing:2px;font-weight:700;margin-bottom:8px;">PLAYER STATS</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;background:#0a1a30;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#0d2240;">
              <th style="padding:8px 10px;color:#6b7280;text-align:left;font-size:10px;">PLAYER</th>
              <th style="padding:8px 10px;color:#6b7280;font-size:10px;">BRD</th>
              <th style="padding:8px 10px;color:#6b7280;font-size:10px;">PAR</th>
              <th style="padding:8px 10px;color:#6b7280;font-size:10px;">BGY</th>
              <th style="padding:8px 10px;color:#6b7280;font-size:10px;">DBL+</th>
              <th style="padding:8px 10px;color:#6b7280;font-size:10px;">AVG</th>
            </tr>
          </thead>
          <tbody>${statsRows}</tbody>
        </table>
      </div>
      ${cartSection}
      ${shotSection}
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

  // GET = diagnostic check
  if (req.method === "GET") {
    const rawResend = Deno.env.get("RESEND_API_KEY") || "";
    const rawSG = Deno.env.get("SENDGRID_API_KEY") || "";
    const resendValid = rawResend.startsWith("re_");
    const sgValid = rawSG.startsWith("SG.");
    const diag: Record<string, unknown> = {
      sendgrid_configured: sgValid,
      sendgrid_key_prefix: rawSG ? rawSG.slice(0, 8) + "..." : null,
      resend_configured: resendValid,
      resend_key_prefix: rawResend ? rawResend.slice(0, 8) + "..." : null,
      primary_provider: sgValid ? "sendgrid" : resendValid ? "resend" : "none",
    };

    // Validate Resend key
    if (resendValid) {
      try {
        const r = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${rawResend}` },
        });
        const body = await r.json();
        diag.resend_status = r.status;
        diag.resend_domains = body;
      } catch (e) {
        diag.resend_error = String(e);
      }
    }

    return new Response(JSON.stringify(diag, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    let payload: RoundPayload;
    try {
      payload = await req.json();
    } catch (parseErr) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body", detail: String(parseErr) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!payload.email) {
      return new Response(
        JSON.stringify({ error: "Email address required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let shots: ShotRow[] = [];
    if (payload.roundId) {
      const { data } = await supabase
        .from("shots")
        .select("hole, shot_index, player_key, distance_yards, cart_lat, cart_lng, cart_heading_deg")
        .eq("round_id", payload.roundId)
        .order("hole", { ascending: true })
        .order("shot_index", { ascending: true });
      shots = (data || []) as ShotRow[];
    }

    const cartStats = computeCartStats(shots, payload.holes);

    const validShots = shots.filter((s) => s.distance_yards > 0);
    const shotStats = {
      totalShots: validShots.length,
      avgDistance: validShots.length > 0
        ? Math.round(validShots.reduce((s, sh) => s + sh.distance_yards, 0) / validShots.length)
        : 0,
      longestShot: validShots.length > 0
        ? Math.max(...validShots.map((s) => s.distance_yards))
        : 0,
    };

    const html = buildEmailHtml(payload, cartStats, shotStats);

    const rawResendKey = Deno.env.get("RESEND_API_KEY") || "";
    const rawSendGridKey = Deno.env.get("SENDGRID_API_KEY") || "";
    const SENDGRID_API_KEY = rawSendGridKey.startsWith("SG.") ? rawSendGridKey : null;
    const RESEND_API_KEY = rawResendKey.startsWith("re_") ? rawResendKey : null;
    const RESEND_VERIFIED_DOMAIN = Deno.env.get("RESEND_FROM_EMAIL") || "";

    if (!SENDGRID_API_KEY && !RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "No valid email provider key configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subject = `Round Stats - ${payload.courseName} (${payload.date})`;
    const errors: string[] = [];

    // Determine the "from" address: use verified domain sender if configured, else onboarding@resend.dev
    const fromAddress = RESEND_VERIFIED_DOMAIN || "VetField Golf <onboarding@resend.dev>";

    // Try Resend first (primary)
    if (RESEND_API_KEY) {
      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [payload.email],
            subject,
            html,
          }),
        });

        if (resendRes.ok) {
          const result = await resendRes.json();
          return new Response(
            JSON.stringify({ success: true, id: result.id, provider: "resend" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const resendBody = await resendRes.text();

        // If 403 due to testing-mode restriction, provide a clear message
        if (resendRes.status === 403 && resendBody.includes("only send testing emails")) {
          errors.push("Resend free-tier: can only send to the account owner email. Verify a domain at resend.com/domains to send to all users.");
        } else {
          errors.push(`Resend(${resendRes.status}): ${resendBody}`);
        }
      } catch (e) {
        errors.push(`Resend error: ${String(e)}`);
      }
    }

    // Fallback to SendGrid
    if (SENDGRID_API_KEY) {
      try {
        const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SENDGRID_API_KEY}`,
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: payload.email }] }],
            from: { email: "stats@vetfield.golf", name: "VetField Golf" },
            subject,
            content: [{ type: "text/html", value: html }],
          }),
        });

        if (sgRes.ok || sgRes.status === 202) {
          return new Response(
            JSON.stringify({ success: true, provider: "sendgrid" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const sgErr = await sgRes.text();
        errors.push(`SendGrid(${sgRes.status}): ${sgErr}`);
      } catch (e) {
        errors.push(`SendGrid error: ${String(e)}`);
      }
    }

    return new Response(
      JSON.stringify({ error: "Email delivery failed", detail: errors.join(" | ") }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
