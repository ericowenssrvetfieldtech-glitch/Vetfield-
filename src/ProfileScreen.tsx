import { useState, useEffect } from "react";
import { NAVY, GOLD, PLAYER_KEYS, getScoreName } from "./constants";
import { useGame } from "./gameStore";
import { useAuth } from "./AuthContext";
import { fetchCompletedRounds, Course, RoundRow } from "./lib/supabase";

function ProfileScreen() {
  const { dispatch } = useGame();
  const { user, signOut } = useAuth();
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"OVERVIEW" | "HANDICAP" | "COURSES">("OVERVIEW");

  useEffect(() => {
    fetchCompletedRounds().then(r => {
      setRounds(r);
      setLoading(false);
    });
  }, []);

  // Calculate handicap index (simplified USGA: best 8 of last 20 differentials * 0.96)
  const calculateHandicapIndex = () => {
    if (rounds.length < 5) return null;

    const differentials: number[] = [];
    rounds.slice(0, 20).forEach(round => {
      const st = round.state as Record<string, unknown>;
      const scores = st.scores as Record<string, Record<string, { strokes: number; putts: number }>> | undefined;
      const course = st.course as Course | undefined;
      if (!scores || !course) return;

      const userScores = scores.p1;
      if (!userScores) return;

      const totalStrokes = Object.values(userScores).reduce((s, h) => s + (h.strokes || 0), 0);
      const coursePar = course.holes.reduce((s, h) => s + h.par, 0);
      const differential = totalStrokes - coursePar;
      differentials.push(differential);
    });

    if (differentials.length < 5) return null;

    const best8 = differentials.sort((a, b) => a - b).slice(0, 8);
    const average = best8.reduce((s, d) => s + d, 0) / best8.length;
    return Math.round(average * 0.96 * 10) / 10;
  };

  // Collect all differentials for handicap tab
  const getAllDifferentials = () => {
    const diffs: { date: string; differential: number }[] = [];
    rounds.forEach(round => {
      const st = round.state as Record<string, unknown>;
      const scores = st.scores as Record<string, Record<string, { strokes: number; putts: number }>> | undefined;
      const course = st.course as Course | undefined;
      if (!scores || !course) return;

      const userScores = scores.p1;
      if (!userScores) return;

      const totalStrokes = Object.values(userScores).reduce((s, h) => s + (h.strokes || 0), 0);
      const coursePar = course.holes.reduce((s, h) => s + h.par, 0);
      const differential = totalStrokes - coursePar;
      const date = round.ended_at ? new Date(round.ended_at).toLocaleDateString() : new Date(round.started_at).toLocaleDateString();
      diffs.push({ date, differential });
    });
    return diffs;
  };

  // Calculate period stats
  const calculatePeriodStats = () => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats = { week: { rounds: 0, avg: 0 }, month: { rounds: 0, avg: 0 }, allTime: { rounds: 0, avg: 0 } };

    rounds.forEach(round => {
      const endDate = round.ended_at ? new Date(round.ended_at) : new Date(round.started_at);
      const st = round.state as Record<string, unknown>;
      const scores = st.scores as Record<string, Record<string, { strokes: number; putts: number }>> | undefined;
      if (!scores) return;

      const userScores = scores.p1;
      if (!userScores) return;

      const totalStrokes = Object.values(userScores).reduce((s, h) => s + (h.strokes || 0), 0);
      if (totalStrokes <= 0) return;

      if (endDate >= weekAgo) {
        stats.week.rounds++;
        stats.week.avg = (stats.week.avg * (stats.week.rounds - 1) + totalStrokes) / stats.week.rounds;
      }
      if (endDate >= monthAgo) {
        stats.month.rounds++;
        stats.month.avg = (stats.month.avg * (stats.month.rounds - 1) + totalStrokes) / stats.month.rounds;
      }
      stats.allTime.rounds++;
      stats.allTime.avg = (stats.allTime.avg * (stats.allTime.rounds - 1) + totalStrokes) / stats.allTime.rounds;
    });

    return {
      week: { rounds: stats.week.rounds, avg: stats.week.avg > 0 ? Math.round(stats.week.avg * 10) / 10 : 0 },
      month: { rounds: stats.month.rounds, avg: stats.month.avg > 0 ? Math.round(stats.month.avg * 10) / 10 : 0 },
      allTime: { rounds: stats.allTime.rounds, avg: stats.allTime.avg > 0 ? Math.round(stats.allTime.avg * 10) / 10 : 0 },
    };
  };

  // Calculate scoring distribution
  const getScoringDistribution = () => {
    const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, worse: 0 };

    rounds.forEach(round => {
      const st = round.state as Record<string, unknown>;
      const scores = st.scores as Record<string, Record<string, { strokes: number; putts: number }>> | undefined;
      const course = st.course as Course | undefined;
      if (!scores || !course) return;

      const userScores = scores.p1;
      if (!userScores) return;

      course.holes.forEach(hole => {
        const score = userScores[String(hole.number)];
        if (!score || !score.strokes) return;

        const diff = score.strokes - hole.par;
        if (diff <= -2) dist.eagle++;
        else if (diff === -1) dist.birdie++;
        else if (diff === 0) dist.par++;
        else if (diff === 1) dist.bogey++;
        else dist.worse++;
      });
    });

    return dist;
  };

  // Calculate performance by par
  const getPerformanceByPar = () => {
    const perf = { par3: { avg: 0, count: 0 }, par4: { avg: 0, count: 0 }, par5: { avg: 0, count: 0 } };

    rounds.forEach(round => {
      const st = round.state as Record<string, unknown>;
      const scores = st.scores as Record<string, Record<string, { strokes: number; putts: number }>> | undefined;
      const course = st.course as Course | undefined;
      if (!scores || !course) return;

      const userScores = scores.p1;
      if (!userScores) return;

      course.holes.forEach(hole => {
        const score = userScores[String(hole.number)];
        if (!score || !score.strokes) return;

        if (hole.par === 3) {
          perf.par3.avg = (perf.par3.avg * perf.par3.count + score.strokes) / (perf.par3.count + 1);
          perf.par3.count++;
        } else if (hole.par === 4) {
          perf.par4.avg = (perf.par4.avg * perf.par4.count + score.strokes) / (perf.par4.count + 1);
          perf.par4.count++;
        } else if (hole.par === 5) {
          perf.par5.avg = (perf.par5.avg * perf.par5.count + score.strokes) / (perf.par5.count + 1);
          perf.par5.count++;
        }
      });
    });

    return perf;
  };

  // Calculate course breakdown
  const getCourseBreakdown = () => {
    const courseMap: Record<string, { name: string; rounds: number; scores: number[] }> = {};

    rounds.forEach(round => {
      const st = round.state as Record<string, unknown>;
      const scores = st.scores as Record<string, Record<string, { strokes: number; putts: number }>> | undefined;
      if (!scores) return;

      const userScores = scores.p1;
      if (!userScores) return;

      const totalStrokes = Object.values(userScores).reduce((s, h) => s + (h.strokes || 0), 0);
      if (totalStrokes <= 0) return;

      if (!courseMap[round.course_name]) {
        courseMap[round.course_name] = { name: round.course_name, rounds: 0, scores: [] };
      }
      courseMap[round.course_name].rounds++;
      courseMap[round.course_name].scores.push(totalStrokes);
    });

    return Object.values(courseMap).map(c => ({
      name: c.name,
      rounds: c.rounds,
      best: Math.min(...c.scores),
      avg: Math.round(c.scores.reduce((a, b) => a + b, 0) / c.scores.length * 10) / 10,
    }));
  };

  const handicapIndex = calculateHandicapIndex();
  const periodStats = calculatePeriodStats();
  const scoringDist = getScoringDistribution();
  const perfByPar = getPerformanceByPar();
  const courseBreakdown = getCourseBreakdown();
  const differentials = getAllDifferentials();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 30% 20%, #0F2444 0%, #050E1A 60%)", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <button onClick={() => dispatch({ type: "SET_VIEW", v: "home" })}
          style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: "rgba(255,255,255,0.08)", color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "'IBM Plex Mono',monospace" }}>← Home</button>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#fff", fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 22 }}>My Stats</div>
          <div style={{ color: "#9CA3AF", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }}>{rounds.length} round{rounds.length !== 1 ? "s" : ""}</div>
        </div>
        <button onClick={handleSignOut}
          style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: "rgba(255,255,255,0.08)", color: "#fff", cursor: "pointer", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }}>Sign Out</button>
      </div>

      {/* User Email */}
      {user && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ color: "#9CA3AF", fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: 0.5 }}>USER</div>
          <div style={{ color: "#fff", fontSize: 13, fontFamily: "'IBM Plex Mono',monospace", marginTop: 4 }}>{user.email}</div>
        </div>
      )}

      {/* Handicap Hero Card */}
      {handicapIndex !== null && (
        <div style={{ background: `linear-gradient(135deg, ${NAVY}80 0%, ${GOLD}20 100%)`, borderRadius: 12, padding: "20px 24px", border: `2px solid ${GOLD}60` }}>
          <div style={{ color: "#9CA3AF", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: 1, marginBottom: 8 }}>HANDICAP INDEX</div>
          <div style={{ fontSize: 48, fontWeight: 700, color: GOLD, fontFamily: "'Rajdhani',sans-serif" }}>{handicapIndex}</div>
          <div style={{ color: "#9CA3AF", fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", marginTop: 8 }}>Based on best 8 of last 20 rounds</div>
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {["OVERVIEW", "HANDICAP", "COURSES"].map(tab => (
          <button key={tab}
            onClick={() => setActiveTab(tab as any)}
            style={{
              padding: "10px 14px",
              border: "none",
              background: "transparent",
              color: activeTab === tab ? GOLD : "#9CA3AF",
              fontFamily: "'IBM Plex Mono',monospace",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              borderBottom: activeTab === tab ? `2px solid ${GOLD}` : "none",
              transition: "color 0.2s",
            }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1 }}>
        {/* OVERVIEW TAB */}
        {activeTab === "OVERVIEW" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Period Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {[
                { label: "This Week", data: periodStats.week },
                { label: "This Month", data: periodStats.month },
                { label: "All Time", data: periodStats.allTime },
              ].map(({ label, data }) => (
                <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "14px 12px", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                  <div style={{ color: "#9CA3AF", fontSize: 9, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: 0.5, marginBottom: 8 }}>THIS WEEK</div>
                  <div style={{ color: "#fff", fontSize: 24, fontWeight: 700, fontFamily: "'Rajdhani',sans-serif" }}>{data.rounds}</div>
                  <div style={{ color: "#93C5FD", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", marginTop: 6 }}>Avg: {data.avg > 0 ? data.avg : "—"}</div>
                </div>
              ))}
            </div>

            {/* Scoring Distribution */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "16px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ color: "#fff", fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Scoring Distribution</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {[
                  { label: "Eagle", count: scoringDist.eagle, color: "#FFD700" },
                  { label: "Birdie", count: scoringDist.birdie, color: "#4CAF50" },
                  { label: "Par", count: scoringDist.par, color: "#93C5FD" },
                  { label: "Bogey", count: scoringDist.bogey, color: "#F87171" },
                  { label: "Worse", count: scoringDist.worse, color: "#EF4444" },
                ].map(({ label, count, color }) => (
                  <div key={label} style={{ textAlign: "center", padding: "10px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 8, borderTop: `3px solid ${color}` }}>
                    <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, fontFamily: "'Rajdhani',sans-serif" }}>{count}</div>
                    <div style={{ color: "#9CA3AF", fontSize: 9, fontFamily: "'IBM Plex Mono',monospace", marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Performance by Par */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "16px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ color: "#fff", fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Performance by Par</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[
                  { label: "Par 3", avg: perfByPar.par3.avg, count: perfByPar.par3.count },
                  { label: "Par 4", avg: perfByPar.par4.avg, count: perfByPar.par4.count },
                  { label: "Par 5", avg: perfByPar.par5.avg, count: perfByPar.par5.count },
                ].map(({ label, avg, count }) => (
                  <div key={label} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "12px", textAlign: "center" }}>
                    <div style={{ color: "#9CA3AF", fontSize: 9, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 6 }}>{label}</div>
                    <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, fontFamily: "'Rajdhani',sans-serif" }}>{avg > 0 ? avg.toFixed(1) : "—"}</div>
                    <div style={{ color: "#6B7280", fontSize: 9, fontFamily: "'IBM Plex Mono',monospace", marginTop: 4 }}>{count} holes</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* HANDICAP TAB */}
        {activeTab === "HANDICAP" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ color: "#fff", fontFamily: "'Rajdhani',sans-serif", fontSize: 13, lineHeight: "1.5" }}>
                Your handicap index is calculated using the simplified USGA formula: the average of your best 8 differentials from your last 20 completed rounds, multiplied by 0.96. Requires at least 5 rounds to calculate.
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "16px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ color: "#fff", fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Recent Differentials</div>
              {differentials.length === 0 ? (
                <div style={{ color: "#6B7280", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, textAlign: "center", padding: "20px 0" }}>No completed rounds</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {differentials.slice(0, 10).map((d, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                      <div style={{ color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10 }}>{d.date}</div>
                      <div style={{ color: d.differential < 0 ? "#4CAF50" : d.differential > 0 ? "#F87171" : "#93C5FD", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700 }}>
                        {d.differential > 0 ? "+" : ""}{d.differential}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* COURSES TAB */}
        {activeTab === "COURSES" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {courseBreakdown.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#6B7280", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>No courses played yet</div>
            ) : (
              courseBreakdown.map((course, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 10 }}>
                    <div>
                      <div style={{ color: "#fff", fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: 14 }}>{course.name}</div>
                      <div style={{ color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, marginTop: 3 }}>{course.rounds} round{course.rounds !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6, padding: "10px", textAlign: "center" }}>
                      <div style={{ color: "#9CA3AF", fontSize: 9, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 4 }}>BEST</div>
                      <div style={{ color: "#4CAF50", fontSize: 16, fontWeight: 700, fontFamily: "'Rajdhani',sans-serif" }}>{course.best}</div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6, padding: "10px", textAlign: "center" }}>
                      <div style={{ color: "#9CA3AF", fontSize: 9, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 4 }}>AVERAGE</div>
                      <div style={{ color: "#93C5FD", fontSize: 16, fontWeight: 700, fontFamily: "'Rajdhani',sans-serif" }}>{course.avg}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>Loading stats...</div>
      )}
    </div>
  );
}

export default ProfileScreen;
