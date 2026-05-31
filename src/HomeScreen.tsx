import { useState, useEffect, useCallback } from "react";
import { NAVY, GREEN, GOLD, PLAYER_COLORS } from "./constants";
import { useGame, init, State } from "./gameStore";
import { fetchCourses, createRound, fetchLatestActiveRound, Course, RoundRow } from "./lib/supabase";
import { useAuth } from "./AuthContext";

// ── INSTALL BUTTON (PWA) ──────────────────────────────────────────────────────
interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{outcome:"accepted"|"dismissed"}>; }

function InstallButton(){
  const [deferred,setDeferred]=useState<BIPEvent|null>(null);
  const [installed,setInstalled]=useState(false);
  const [showHelp,setShowHelp]=useState(false);

  useEffect(()=>{
    const isStandalone=window.matchMedia("(display-mode: standalone)").matches
      || (navigator as unknown as {standalone?:boolean}).standalone===true;
    if(isStandalone) setInstalled(true);

    const onPrompt=(e:Event)=>{ e.preventDefault(); setDeferred(e as BIPEvent); };
    const onInstalled=()=>{ setInstalled(true); setDeferred(null); };

    window.addEventListener("beforeinstallprompt",onPrompt);
    window.addEventListener("appinstalled",onInstalled);
    return ()=>{
      window.removeEventListener("beforeinstallprompt",onPrompt);
      window.removeEventListener("appinstalled",onInstalled);
    };
  },[]);

  const isIOS=/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as unknown as {standalone?:boolean}).standalone;

  if(installed) return (
    <div style={{color:"#34D399",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,letterSpacing:1,display:"flex",alignItems:"center",gap:6}}>
      <span style={{width:7,height:7,borderRadius:"50%",background:"#34D399"}}/> INSTALLED
    </div>
  );

  const handleClick=async()=>{
    if(deferred){
      await deferred.prompt();
      const res=await deferred.userChoice;
      if(res.outcome==="accepted") setInstalled(true);
      setDeferred(null);
    } else {
      setShowHelp(h=>!h);
    }
  };

  return(
    <div style={{width:"100%",display:"flex",flexDirection:"column",gap:8}}>
      <button type="button" onClick={handleClick}
        style={{width:"100%",padding:"11px 14px",borderRadius:8,
          border:`1px solid ${GOLD}60`,background:"rgba(200,150,12,0.08)",
          color:GOLD,fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:14,letterSpacing:1.5,
          cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        INSTALL APP
      </button>
      {showHelp && (
        <div style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",
          borderRadius:8,padding:"10px 12px",color:"#D1D5DB",fontSize:12,lineHeight:1.5}}>
          {isIOS ? (
            <>On iPhone or iPad: tap the <strong>Share</strong> icon in Safari, then choose <strong>Add to Home Screen</strong>.</>
          ) : (
            <>On desktop Chrome/Edge: click the <strong>install icon</strong> in the address bar. On Android: open in Chrome and tap menu → <strong>Install app</strong>.</>
          )}
        </div>
      )}
    </div>
  );
}

// ── HOME SCREEN ───────────────────────────────────────────────────────────────
function HomeScreen(){
  const {state,dispatch}=useGame();
  const [playerCount,setPlayerCount]=useState(2);
  const [names,setNames]=useState(["Eric","Player 2","Player 3","Player 4"]);
  const [courses,setCourses]=useState<Course[]>([state.course]);
  const [loadingCourses,setLoadingCourses]=useState(true);
  const [resumable,setResumable]=useState<RoundRow|null>(null);
  const [starting,setStarting]=useState(false);

  const reloadCourses=useCallback(async()=>{
    const list=await fetchCourses();
    setLoadingCourses(false);
    if(list.length===0) return;
    setCourses(list);
  },[]);

  useEffect(()=>{
    let alive=true;
    fetchCourses().then(list=>{
      if(!alive) return;
      setLoadingCourses(false);
      if(list.length===0) return;
      setCourses(list);
      const preferred=list.find(c=>c.slug===state.course.slug)||list[0];
      dispatch({type:"SET_COURSE",course:preferred});
    });
    fetchLatestActiveRound().then(r=>{ if(alive) setResumable(r); });
    return ()=>{alive=false;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    if(state.view==="home") reloadCourses();
  },[state.view,reloadCourses]);

  const selected=state.course;

  const setName=(i: number, v: string)=>{
    setNames(prev=>{ const n=[...prev]; n[i]=v; return n; });
  };

  const handleStart=async()=>{
    if(starting) return;
    setStarting(true);
    const activePlayers = names.slice(0, playerCount).map((n,i) => n || `Player ${i+1}`);
    const round = { players: activePlayers, date: new Date().toLocaleDateString() };
    const snapshot={...init,course:selected,round,view:"round",currentHole:1};
    const row=await createRound({
      course:selected,
      player1_name: activePlayers[0] || "",
      player2_name: activePlayers[1] || "",
      player3_name: activePlayers[2] || "",
      player4_name: activePlayers[3] || "",
      state:snapshot as unknown as Record<string,unknown>,
    });
    dispatch({type:"START",p:round});
    if(row) dispatch({type:"SET_ROUND_ID",id:row.id});
    setStarting(false);
  };

  const handleResume=()=>{
    if(!resumable) return;
    const saved=resumable.state as unknown as Partial<State>;
    dispatch({type:"HYDRATE",patch:{...saved,roundId:resumable.id,view:"round"}});
  };

  const PLAYER_BORDER_COLORS = [PLAYER_COLORS.p1, PLAYER_COLORS.p2, PLAYER_COLORS.p3, PLAYER_COLORS.p4];

  const auth=useAuth();

  return(
    <div style={{minHeight:"100vh",background:"radial-gradient(ellipse at 30% 20%, #0F2444 0%, #050E1A 60%)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20,position:"relative"}}>
      {/* Sign-out corner button */}
      <button onClick={()=>auth.signOut()}
        style={{position:"absolute",top:16,right:16,padding:"6px 12px",borderRadius:6,
          border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",
          color:"#9CA3AF",cursor:"pointer",fontSize:10,fontFamily:"'IBM Plex Mono',monospace",
          transition:"background 0.15s"}}
        onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.1)")}
        onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,0.04)")}>
        Sign Out
      </button>

      <div style={{width:"100%",maxWidth:440,display:"flex",flexDirection:"column",alignItems:"center",gap:18}}>
        <div style={{width:72,height:72,background:NAVY,borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:`0 0 40px ${NAVY}80`,fontSize:32,border:`2px solid ${GOLD}40`}}>⛳</div>

        <div style={{textAlign:"center"}}>
          <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:34,letterSpacing:2,
            background:`linear-gradient(135deg, #fff 30%, ${GOLD})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1.05}}>
            VetField Golf
          </div>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:14,color:PLAYER_COLORS.p1,letterSpacing:4,marginTop:2}}>
            SMARTCART CADDY
          </div>
        </div>

        {resumable && (
          <button type="button" onClick={handleResume}
            style={{width:"100%",padding:"12px 14px",borderRadius:10,cursor:"pointer",
              border:`1px solid ${GOLD}80`,background:`linear-gradient(135deg,${GOLD}22,${NAVY}77)`,
              display:"flex",justifyContent:"space-between",alignItems:"center",textAlign:"left"}}>
            <div>
              <div style={{color:GOLD,fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:1.5}}>RESUME ROUND</div>
              <div style={{color:"#fff",fontWeight:600,fontSize:15,marginTop:3}}>{resumable.course_name}</div>
              <div style={{color:"#9CA3AF",fontSize:11,fontFamily:"'IBM Plex Mono',monospace",marginTop:2}}>
                {[resumable.player1_name,resumable.player2_name,resumable.player3_name,resumable.player4_name]
                  .filter(Boolean).join(" · ")}
              </div>
            </div>
            <div style={{color:GOLD,fontSize:22}}>▶</div>
          </button>
        )}

        {/* Player count selector + names */}
        <div style={{background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"18px 20px",width:"100%",border:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:1}}>PLAYERS</div>
            <div style={{display:"flex",gap:4}}>
              {[1,2,3,4].map(n=>(
                <button key={n} type="button" onClick={()=>setPlayerCount(n)}
                  style={{width:36,height:30,borderRadius:6,border:"none",cursor:"pointer",
                    fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:13,
                    background:playerCount===n?NAVY:"rgba(255,255,255,0.07)",
                    color:playerCount===n?"#fff":"#6B7280",
                    outline:playerCount===n?`2px solid ${GOLD}60`:"none",
                    transition:"all 0.15s"}}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {Array.from({length:playerCount},(_,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:PLAYER_BORDER_COLORS[i],flexShrink:0}}/>
                <input value={names[i]} onChange={e=>setName(i,e.target.value)}
                  placeholder={`Player ${i+1}`}
                  style={{flex:1,padding:"10px 12px",borderRadius:6,background:"rgba(255,255,255,0.07)",
                    border:`1px solid ${PLAYER_BORDER_COLORS[i]}60`,color:"#fff",fontSize:16,
                    fontFamily:"'Rajdhani',sans-serif",outline:"none"}}/>
              </div>
            ))}
          </div>
        </div>

        <div style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"14px 16px",width:"100%",
          border:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8}}>
            <div style={{color:GOLD,fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:1}}>COURSE</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{color:"#4B5563",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,letterSpacing:1}}>
                {loadingCourses?"LOADING...":`${courses.length} AVAILABLE`}
              </div>
              <button type="button" onClick={()=>dispatch({type:"SET_VIEW",v:"addCourse"})}
                style={{padding:"4px 9px",borderRadius:4,border:`1px dashed ${GOLD}80`,
                  background:"transparent",color:GOLD,
                  fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:1,cursor:"pointer"}}>
                + ADD
              </button>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:220,overflowY:"auto"}}>
            {courses.map(c=>{
              const isActive=selected.id===c.id||selected.slug===c.slug;
              const par=c.holes.reduce((s,h)=>s+h.par,0);
              return(
                <button key={c.id} type="button"
                  onClick={()=>dispatch({type:"SET_COURSE",course:c})}
                  style={{textAlign:"left",padding:"10px 12px",borderRadius:8,cursor:"pointer",
                    border:`1px solid ${isActive?GOLD:"rgba(255,255,255,0.08)"}`,
                    background:isActive?`${NAVY}55`:"rgba(0,0,0,0.25)",
                    transition:"all 0.15s",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:"#fff",fontWeight:600,fontSize:15}}>{c.name}</div>
                    <div style={{color:"#9CA3AF",fontSize:11,fontFamily:"'IBM Plex Mono',monospace",marginTop:2}}>
                      {c.location || "—"} · {c.holes.length}H · Par {par}
                    </div>
                  </div>
                  <div style={{color:isActive?GOLD:"#4B5563",fontSize:18,transition:"color 0.15s"}}>
                    {isActive?"●":"○"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={handleStart} disabled={starting}
          style={{width:"100%",padding:"15px 20px",borderRadius:10,border:"none",cursor:starting?"wait":"pointer",fontSize:18,fontWeight:700,
            letterSpacing:2,fontFamily:"'Rajdhani',sans-serif",opacity:starting?0.7:1,
            background:`linear-gradient(135deg,${GREEN} 0%,#1B6B20 100%)`,color:"#fff",
            boxShadow:`0 4px 20px ${GREEN}60`,transition:"transform 0.1s,opacity 0.2s"}}
          onMouseDown={e=>(e.currentTarget.style.transform="scale(0.98)")}
          onMouseUp={e=>(e.currentTarget.style.transform="scale(1)")}>
          {starting?"STARTING...":"START ROUND"}
        </button>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <button onClick={()=>dispatch({type:"SET_VIEW",v:"history"})}
            style={{padding:"12px 16px",borderRadius:10,cursor:"pointer",
              border:`1px solid ${NAVY}`,background:"rgba(15,36,68,0.4)",
              color:"#93C5FD",fontFamily:"'Rajdhani',sans-serif",fontWeight:600,fontSize:14,letterSpacing:1,
              display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"background 0.15s"}}
            onMouseEnter={e=>(e.currentTarget.style.background="rgba(15,36,68,0.7)")}
            onMouseLeave={e=>(e.currentTarget.style.background="rgba(15,36,68,0.4)")}>
            HISTORY
          </button>
          <button onClick={()=>dispatch({type:"SET_VIEW",v:"profile"})}
            style={{padding:"12px 16px",borderRadius:10,cursor:"pointer",
              border:`1px solid ${NAVY}`,background:"rgba(15,36,68,0.4)",
              color:GOLD,fontFamily:"'Rajdhani',sans-serif",fontWeight:600,fontSize:14,letterSpacing:1,
              display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"background 0.15s"}}
            onMouseEnter={e=>(e.currentTarget.style.background="rgba(15,36,68,0.7)")}
            onMouseLeave={e=>(e.currentTarget.style.background="rgba(15,36,68,0.4)")}>
            MY STATS
          </button>
        </div>

        <InstallButton/>

        <div style={{display:"flex",alignItems:"center",gap:8,color:"#4B5563",fontSize:11,fontFamily:"'IBM Plex Mono',monospace"}}>
          <span>VetField Technologies</span>
          <span style={{background:GOLD,color:"#000",padding:"1px 5px",borderRadius:3,fontSize:9,fontWeight:700}}>SDVOSB</span>
        </div>
      </div>
    </div>
  );
}

export default HomeScreen;
