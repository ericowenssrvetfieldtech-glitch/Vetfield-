import { useState } from "react";
import { useGame, usePlayers, ShotRecord } from "./gameStore";
import { useAuth } from "./AuthContext";
import { NAVY, GOLD, PLAYER_KEYS, PLAYER_COLORS, PlayerKey } from "./constants";
import { supabase } from "./lib/supabase";
import { ScorecardPanel } from "./RoundScreen";

function ReviewScreen(){
  const {state,dispatch}=useGame();
  const auth=useAuth();
  const players = usePlayers();
  const course=state.course;
  const par=course.holes.reduce((s,h)=>s+h.par,0);
  const nameOf = (pk: PlayerKey) => state.round?.players[PLAYER_KEYS.indexOf(pk)] || pk.toUpperCase();
  const [emailStatus,setEmailStatus]=useState<"idle"|"sending"|"sent"|"error">("idle");
  const [emailError,setEmailError]=useState<string|null>(null);
  const [reviewTab,setReviewTab]=useState<"scorecard"|"stats">("scorecard");

  const totals = players.map(pk =>
    Object.values(state.scores[pk] || {}).reduce((s,h)=>s+(h.strokes||0),0)
  );

  // Per-player round stats
  const playerStats = (pk: PlayerKey) => {
    const scores = state.scores[pk] || {};
    const shots = state.shots[pk] || {};
    let birdies=0, pars=0, bogeys=0, doubles=0, worse=0;
    let totalStrokes=0;
    let holesScored=0;
    let bestHole=0, worstHole=0, bestDiff=99, worstDiff=-99;
    let longestShot=0, totalDist=0, shotCount=0;

    course.holes.forEach(h=>{
      const s=scores[h.number]?.strokes;
      if(!s) return;
      holesScored++;
      totalStrokes+=s;
      const d=s-h.par;
      if(d<=-1) birdies++;
      else if(d===0) pars++;
      else if(d===1) bogeys++;
      else if(d===2) doubles++;
      else if(d>2) worse++;
      if(d<bestDiff){ bestDiff=d; bestHole=h.number; }
      if(d>worstDiff){ worstDiff=d; worstHole=h.number; }

      const holeShots=(shots[h.number] as ShotRecord[])||[];
      holeShots.forEach(sh=>{
        if(sh.dist>0){ totalDist+=sh.dist; shotCount++; if(sh.dist>longestShot) longestShot=sh.dist; }
      });
    });

    const avgDist=shotCount>0?Math.round(totalDist/shotCount):0;
    const scoringAvg=holesScored>0?(totalStrokes/holesScored).toFixed(1):"—";
    return{birdies,pars,bogeys,doubles,worse,totalStrokes,longestShot,avgDist,holesScored,
      scoringAvg,bestHole,worstHole,bestDiff,worstDiff};
  };

  // Determine winner
  const winner = totals.every(t=>t>0) ? players[totals.indexOf(Math.min(...totals.filter(t=>t>0)))] : null;

  const handleEmailSummary = async () => {
    const email = auth.user?.email;
    if(!email){ setEmailError("No email on account"); setEmailStatus("error"); return; }
    setEmailStatus("sending");
    setEmailError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-round-stats`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          roundId: state.roundId || null,
          email,
          courseName: course.name,
          date: state.round?.date || new Date().toLocaleDateString(),
          players: players.map(pk => nameOf(pk)),
          holes: course.holes.map(h => ({number:h.number, par:h.par, yards:h.yards})),
          scores: state.scores,
        }),
      });
      if(res.ok){
        setEmailStatus("sent");
        setTimeout(()=>setEmailStatus("idle"), 3000);
      } else {
        const body = await res.json().catch(()=>({error:"Unknown error"}));
        setEmailError(body.detail || body.error || "Failed to send");
        setEmailStatus("error");
      }
    } catch(e){
      setEmailError(String(e));
      setEmailStatus("error");
    }
  };

  return(
    <div style={{minHeight:"100vh",background:"#050E1A",padding:16,display:"flex",flexDirection:"column",gap:14}}>
      {/* Header with trophy animation */}
      <div style={{textAlign:"center",position:"relative",paddingTop:8}}>
        <div style={{color:GOLD,fontFamily:"'IBM Plex Mono',monospace",fontSize:11,letterSpacing:2,marginBottom:4}}>ROUND COMPLETE</div>
        <div style={{color:"#fff",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:28}}>{course.name}</div>
        <div style={{color:"#9CA3AF",fontSize:12,fontFamily:"'IBM Plex Mono',monospace"}}>{state.round?.date} · Par {par}</div>
      </div>

      {/* Player results cards */}
      <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(players.length,2)},1fr)`,gap:10}}>
        {players.map((pk,i)=>{
          const t=totals[i],d=t-par,col=PLAYER_COLORS[pk];
          const isWinner=winner===pk && players.length>1;
          return(
            <div key={pk} style={{background:isWinner?`linear-gradient(135deg,${GOLD}10,rgba(255,255,255,0.04))`:"rgba(255,255,255,0.04)",
              borderRadius:10,padding:"14px 16px",
              border:`1px solid ${isWinner?GOLD+"60":col+"30"}`,textAlign:"center",position:"relative"}}>
              {isWinner && <div style={{position:"absolute",top:-6,left:"50%",transform:"translateX(-50%)",
                background:GOLD,color:"#000",padding:"2px 8px",borderRadius:4,
                fontFamily:"'IBM Plex Mono',monospace",fontSize:8,fontWeight:700,letterSpacing:1}}>WINNER</div>}
              <div style={{color:col,fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:700,marginBottom:6}}>
                {nameOf(pk)}
              </div>
              <div style={{color:"#fff",fontSize:36,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>{t||"—"}</div>
              <div style={{color:d<0?"#4CAF50":d>0?"#F87171":"#93C5FD",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,marginTop:2}}>
                {t>0?(d===0?"Even":`${d>0?"+":""}${d}`):"—"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tab toggle */}
      <div style={{display:"flex",background:"rgba(255,255,255,0.03)",borderRadius:8,overflow:"hidden",
        border:"1px solid rgba(255,255,255,0.06)"}}>
        <button onClick={()=>setReviewTab("scorecard")}
          style={{flex:1,padding:"9px 8px",border:"none",cursor:"pointer",fontSize:11,
            fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,letterSpacing:0.5,
            background:reviewTab==="scorecard"?NAVY:"transparent",
            color:reviewTab==="scorecard"?"#fff":"#6B7280",
            borderBottom:reviewTab==="scorecard"?`2px solid ${GOLD}`:"2px solid transparent"}}>
          SCORECARD
        </button>
        <button onClick={()=>setReviewTab("stats")}
          style={{flex:1,padding:"9px 8px",border:"none",cursor:"pointer",fontSize:11,
            fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,letterSpacing:0.5,
            background:reviewTab==="stats"?NAVY:"transparent",
            color:reviewTab==="stats"?"#fff":"#6B7280",
            borderBottom:reviewTab==="stats"?`2px solid ${GOLD}`:"2px solid transparent"}}>
          STATS
        </button>
      </div>

      {reviewTab==="scorecard" && <ScorecardPanel/>}

      {reviewTab==="stats" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {players.map(pk=>{
            const stats=playerStats(pk);
            const col=PLAYER_COLORS[pk];
            const distItems = [
              {label:"Birdies+",val:stats.birdies,color:"#4CAF50"},
              {label:"Pars",val:stats.pars,color:"#93C5FD"},
              {label:"Bogeys",val:stats.bogeys,color:"#FB923C"},
              {label:"Doubles+",val:stats.doubles+stats.worse,color:"#F87171"},
            ];
            return(
              <div key={pk} style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"14px 16px",
                border:`1px solid ${col}20`}}>
                <div style={{color:col,fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:700,marginBottom:10}}>{nameOf(pk)}</div>
                {stats.holesScored===0 ? (
                  <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,padding:"12px 0",textAlign:"center"}}>
                    No scores recorded
                  </div>
                ) : (<>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                    <div style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"8px 8px",textAlign:"center"}}>
                      <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:8}}>SCORING AVG</div>
                      <div style={{color:"#fff",fontSize:16,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>{stats.scoringAvg}</div>
                    </div>
                    <div style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"8px 8px",textAlign:"center"}}>
                      <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:8}}>HOLES</div>
                      <div style={{color:"#fff",fontSize:16,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>{stats.holesScored}/{course.holes.length}</div>
                    </div>
                    <div style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"8px 8px",textAlign:"center"}}>
                      <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:8}}>TOTAL</div>
                      <div style={{color:"#fff",fontSize:16,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>{stats.totalStrokes}</div>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                    <div style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"8px 8px",textAlign:"center"}}>
                      <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:8}}>BEST HOLE</div>
                      <div style={{color:"#4CAF50",fontSize:14,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>
                        #{stats.bestHole} ({stats.bestDiff===0?"E":stats.bestDiff>0?`+${stats.bestDiff}`:stats.bestDiff})
                      </div>
                    </div>
                    <div style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"8px 8px",textAlign:"center"}}>
                      <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:8}}>WORST HOLE</div>
                      <div style={{color:"#F87171",fontSize:14,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>
                        #{stats.worstHole} ({stats.worstDiff===0?"E":stats.worstDiff>0?`+${stats.worstDiff}`:stats.worstDiff})
                      </div>
                    </div>
                  </div>
                  {stats.avgDist>0 && (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                      <div style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"8px 8px",textAlign:"center"}}>
                        <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:8}}>AVG SHOT</div>
                        <div style={{color:"#fff",fontSize:14,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>{stats.avgDist}y</div>
                      </div>
                      <div style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"8px 8px",textAlign:"center"}}>
                        <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:8}}>LONGEST</div>
                        <div style={{color:"#fff",fontSize:14,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>{stats.longestShot}y</div>
                      </div>
                    </div>
                  )}
                  <div style={{display:"flex",gap:2,borderRadius:4,overflow:"hidden",height:8,marginBottom:8}}>
                    {distItems.filter(d=>d.val>0).map(d=>(
                      <div key={d.label} style={{flex:d.val,background:d.color,transition:"flex 0.3s ease"}}/>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:12}}>
                    {distItems.map(d=>(
                      <div key={d.label} style={{display:"flex",alignItems:"center",gap:4}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:d.color}}/>
                        <span style={{color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:9}}>{d.label}: {d.val}</span>
                      </div>
                    ))}
                  </div>
                </>)}
              </div>
            );
          })}
        </div>
      )}

      {/* Email summary */}
      <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"14px 16px",
        border:"1px solid rgba(200,150,12,0.15)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{color:"#fff",fontFamily:"'Rajdhani',sans-serif",fontSize:14,fontWeight:600}}>Email Round Summary</div>
            <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,marginTop:2}}>
              Send scorecard to {auth.user?.email || "your email"}
            </div>
          </div>
          <button onClick={handleEmailSummary}
            disabled={emailStatus==="sending"}
            style={{padding:"9px 16px",borderRadius:8,border:"none",cursor:emailStatus==="sending"?"default":"pointer",
              background: emailStatus==="sent" ? "rgba(76,175,80,0.15)"
                : emailStatus==="error" ? "rgba(248,113,113,0.15)"
                : `linear-gradient(135deg,${GOLD},#9A7200)`,
              color: emailStatus==="sent" ? "#4CAF50" : emailStatus==="error" ? "#F87171" : "#fff",
              fontSize:12,fontFamily:"'IBM Plex Mono',monospace",fontWeight:600,
              opacity: emailStatus==="sending" ? 0.6 : 1,
              transition:"all 0.15s"}}>
            {emailStatus==="idle" && "Send"}
            {emailStatus==="sending" && "Sending..."}
            {emailStatus==="sent" && "Sent!"}
            {emailStatus==="error" && "Retry"}
          </button>
        </div>
        {emailError && (
          <div style={{marginTop:8,color:"#F87171",fontSize:10,fontFamily:"'IBM Plex Mono',monospace"}}>{emailError}</div>
        )}
      </div>

      <div style={{display:"flex",gap:10}}>
        <button onClick={()=>dispatch({type:"RESET"})}
          style={{flex:1,padding:"13px",borderRadius:8,border:"1px solid rgba(255,255,255,0.15)",
            background:"transparent",color:"#fff",fontSize:14,fontFamily:"'Rajdhani',sans-serif",fontWeight:600,cursor:"pointer"}}>
          New Round
        </button>
        <button onClick={()=>dispatch({type:"SET_VIEW",v:"profile"})}
          style={{flex:1,padding:"13px",borderRadius:8,border:"none",
            background:`linear-gradient(135deg,${NAVY},#0F2444)`,
            color:"#fff",fontSize:14,fontFamily:"'Rajdhani',sans-serif",fontWeight:600,cursor:"pointer"}}>
          View Stats
        </button>
      </div>
    </div>
  );
}

export default ReviewScreen;
