import { useState, useEffect } from "react";
import { GOLD, PLAYER_KEYS, PLAYER_COLORS, getScoreName } from "./constants";
import { useGame } from "./gameStore";
import { fetchCompletedRounds, Course, RoundRow } from "./lib/supabase";

function HistoryScreen(){
  const {dispatch}=useGame();
  const [rounds,setRounds]=useState<RoundRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [selectedRound,setSelectedRound]=useState<RoundRow|null>(null);

  useEffect(()=>{
    fetchCompletedRounds().then(r=>{setRounds(r);setLoading(false);});
  },[]);

  if(selectedRound){
    const st=selectedRound.state as Record<string,unknown>;
    const scores=st.scores as Record<string,Record<string,{strokes:number;putts:number}>>|undefined;
    const course=st.course as Course|undefined;
    const roundInfo=st.round as {players:string[];date:string}|undefined;
    const playerNames=[selectedRound.player1_name,selectedRound.player2_name,selectedRound.player3_name,selectedRound.player4_name].filter(Boolean);
    const par=course?course.holes.reduce((s,h)=>s+h.par,0):0;

    return(
      <div style={{minHeight:"100vh",background:"#050E1A",padding:16,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setSelectedRound(null)}
            style={{padding:"8px 12px",borderRadius:6,border:"none",background:"rgba(255,255,255,0.08)",
              color:"#fff",cursor:"pointer",fontSize:12,fontFamily:"'IBM Plex Mono',monospace"}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{color:"#fff",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:20}}>{selectedRound.course_name}</div>
            <div style={{color:"#9CA3AF",fontSize:11,fontFamily:"'IBM Plex Mono',monospace"}}>
              {roundInfo?.date || new Date(selectedRound.ended_at||selectedRound.started_at).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Player results */}
        <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(playerNames.length,2)},1fr)`,gap:10}}>
          {playerNames.map((name,i)=>{
            const pk=PLAYER_KEYS[i];
            const playerScores=scores?.[pk];
            const total=playerScores?Object.values(playerScores).reduce((s,h)=>s+(h.strokes||0),0):0;
            const diff=total-par;
            const col=PLAYER_COLORS[pk];
            return(
              <div key={i} style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"14px 16px",
                border:`1px solid ${col}30`,textAlign:"center"}}>
                <div style={{color:col,fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:700,marginBottom:6}}>{name}</div>
                <div style={{color:"#fff",fontSize:36,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>{total||"—"}</div>
                <div style={{color:diff<0?"#4CAF50":diff>0?"#F87171":"#93C5FD",fontFamily:"'IBM Plex Mono',monospace",fontSize:12,marginTop:2}}>
                  {total>0?(diff===0?"Even":`${diff>0?"+":""}${diff}`):"—"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Hole by hole breakdown */}
        {course && scores && (
          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,overflow:"hidden",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{display:"grid",gridTemplateColumns:`48px 36px ${playerNames.map(()=>"1fr").join(" ")}`,
              background:"#0F2444",padding:"7px 10px",gap:4}}>
              {["HOLE","PAR",...playerNames.map(n=>n.slice(0,6))].map((h,i)=>(
                <div key={i} style={{color:i>=2?PLAYER_COLORS[PLAYER_KEYS[i-2]]:"#93C5FD",
                  fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:1,
                  textAlign:i>1?"center":"left"}}>{h}</div>
              ))}
            </div>
            {course.holes.map((hole,idx)=>(
              <div key={hole.number} style={{display:"grid",gridTemplateColumns:`48px 36px ${playerNames.map(()=>"1fr").join(" ")}`,
                padding:"8px 10px",gap:4,borderBottom:"1px solid rgba(255,255,255,0.04)",
                background:idx%2===0?"rgba(255,255,255,0.02)":"transparent"}}>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",color:"#fff",fontSize:13}}>{hole.number}</div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",color:"#9CA3AF",fontSize:12}}>{hole.par}</div>
                {playerNames.map((_,i)=>{
                  const pk=PLAYER_KEYS[i];
                  const s=scores[pk]?.[String(hole.number)]?.strokes;
                  const info=s&&s>0?getScoreName(s,hole.par):null;
                  return(
                    <div key={i} style={{textAlign:"center",fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:14,
                      color:info?.c||"#6B7280"}}>
                      {s&&s>0?s:"—"}
                    </div>
                  );
                })}
              </div>
            ))}
            <div style={{display:"grid",gridTemplateColumns:`48px 36px ${playerNames.map(()=>"1fr").join(" ")}`,
              background:"#0F2444",padding:"9px 10px",gap:4,borderTop:`2px solid ${GOLD}55`}}>
              <div style={{color:GOLD,fontFamily:"'IBM Plex Mono',monospace",fontSize:10,fontWeight:700,letterSpacing:1,gridColumn:"1/3"}}>TOTAL</div>
              {playerNames.map((_,i)=>{
                const pk=PLAYER_KEYS[i];
                const t=scores[pk]?Object.values(scores[pk]).reduce((s,h)=>s+(h.strokes||0),0):0;
                const d=t-par;
                const c=d<0?"#4CAF50":d>0?"#F87171":"#fff";
                return <div key={i} style={{textAlign:"center",fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:15,color:c}}>
                  {t>0?t:"—"}{t>0&&d!==0&&<span style={{fontSize:10,marginLeft:3}}>({d>0?"+":""}{d})</span>}
                </div>;
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return(
    <div style={{minHeight:"100vh",background:"radial-gradient(ellipse at 30% 20%, #0F2444 0%, #050E1A 60%)",
      padding:16,display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <button onClick={()=>dispatch({type:"SET_VIEW",v:"home"})}
          style={{padding:"8px 12px",borderRadius:6,border:"none",background:"rgba(255,255,255,0.08)",
            color:"#fff",cursor:"pointer",fontSize:12,fontFamily:"'IBM Plex Mono',monospace"}}>← Home</button>
        <div>
          <div style={{color:"#fff",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:22}}>Round History</div>
          <div style={{color:"#9CA3AF",fontSize:11,fontFamily:"'IBM Plex Mono',monospace"}}>{rounds.length} completed round{rounds.length!==1?"s":""}</div>
        </div>
      </div>

      {loading && (
        <div style={{textAlign:"center",padding:40,color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:12}}>Loading...</div>
      )}

      {!loading && rounds.length===0 && (
        <div style={{textAlign:"center",padding:60,display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
          <div style={{fontSize:40,opacity:0.3}}>⛳</div>
          <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:12}}>No completed rounds yet</div>
          <div style={{color:"#4B5563",fontSize:11}}>Complete a round and it will appear here</div>
        </div>
      )}

      {!loading && rounds.length > 0 && (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {rounds.map(round=>{
            const st=round.state as Record<string,unknown>;
            const scores=st.scores as Record<string,Record<string,{strokes:number;putts:number}>>|undefined;
            const course=st.course as Course|undefined;
            const par=course?course.holes.reduce((s,h)=>s+h.par,0):0;
            const playerNames=[round.player1_name,round.player2_name,round.player3_name,round.player4_name].filter(Boolean);
            const endDate=round.ended_at?new Date(round.ended_at).toLocaleDateString():"—";

            return(
              <button key={round.id} onClick={()=>setSelectedRound(round)}
                style={{textAlign:"left",padding:"14px 16px",borderRadius:10,cursor:"pointer",
                  border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",
                  display:"flex",flexDirection:"column",gap:8,transition:"border-color 0.15s",width:"100%"}}
                onMouseEnter={e=>(e.currentTarget.style.borderColor=`${GOLD}60`)}
                onMouseLeave={e=>(e.currentTarget.style.borderColor="rgba(255,255,255,0.08)")}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%"}}>
                  <div>
                    <div style={{color:"#fff",fontWeight:600,fontSize:16,fontFamily:"'Rajdhani',sans-serif"}}>{round.course_name}</div>
                    <div style={{color:"#9CA3AF",fontSize:10,fontFamily:"'IBM Plex Mono',monospace",marginTop:2}}>{endDate}</div>
                  </div>
                  <div style={{color:GOLD,fontSize:16}}>▶</div>
                </div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                  {playerNames.map((name,i)=>{
                    const pk=PLAYER_KEYS[i];
                    const total=scores?.[pk]?Object.values(scores[pk]).reduce((s,h)=>s+(h.strokes||0),0):0;
                    const diff=total-par;
                    return(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:7,height:7,borderRadius:"50%",background:PLAYER_COLORS[pk]}}/>
                        <span style={{color:"#D1D5DB",fontSize:11,fontFamily:"'IBM Plex Mono',monospace"}}>{name}</span>
                        {total>0 && (
                          <span style={{color:diff<0?"#4CAF50":diff>0?"#F87171":"#93C5FD",
                            fontSize:11,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace"}}>
                            {total} ({diff===0?"E":`${diff>0?"+":""}${diff}`})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default HistoryScreen;
