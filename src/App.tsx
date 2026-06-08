import { useState, useReducer, useEffect, useRef, lazy, Suspense } from "react";
import { Maximize, Minimize } from "lucide-react";
import { useAuth } from "./AuthContext";
import { AuthScreen } from "./AuthScreen";
import { GameCtx, reducer, init } from "./gameStore";
import { updateRoundState, completeRound } from "./lib/supabase";
import AddCourseScreen from "./AddCourseScreen";
import type { State } from "./gameStore";

const HomeScreen = lazy(() => import("./HomeScreen"));
const RoundScreen = lazy(() => import("./RoundScreen"));
const ReviewScreen = lazy(() => import("./ReviewScreen"));
const HistoryScreen = lazy(() => import("./HistoryScreen"));
const ProfileScreen = lazy(() => import("./ProfileScreen"));
const SwingAnalyzerScreen = lazy(() => import("./SwingAnalyzerScreen"));

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#050E1A;color:#fff;font-family:'Rajdhani',sans-serif;}
  .app{width:100%;min-height:100vh;background:#050E1A;display:flex;flex-direction:column;}
  input{font-family:inherit;}
  button{font-family:inherit;cursor:pointer;}
  ::-webkit-scrollbar{width:4px;}
  ::-webkit-scrollbar-thumb{background:#1B3A6B;border-radius:2px;}
`;

function PersistenceBridge({ state }: { state: State }){
  const saveTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const completedRef=useRef<string|null>(null);

  useEffect(()=>{
    if(!state.roundId || state.view!=="round") return;
    if(saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>{
      updateRoundState(state.roundId!, state as unknown as Record<string,unknown>);
    },800);
    return ()=>{ if(saveTimer.current) clearTimeout(saveTimer.current); };
  },[state]);

  useEffect(()=>{
    if(state.view==="review" && state.roundId && completedRef.current!==state.roundId){
      completedRef.current=state.roundId;
      updateRoundState(state.roundId, state as unknown as Record<string,unknown>)
        .then(()=>completeRound(state.roundId!));
    }
  },[state.view,state.roundId,state]);

  return null;
}

function LoadingFallback(){
  return(
    <div style={{minHeight:"100vh",background:"#050E1A",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:12}}>Loading...</div>
    </div>
  );
}

export default function App(){
  const auth = useAuth();
  const [state,dispatch]=useReducer(reducer,init);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  if(auth.loading){
    return <LoadingFallback/>;
  }

  if(!auth.user){
    return <AuthScreen/>;
  }

  return(
    <GameCtx.Provider value={{state,dispatch}}>
      <style>{CSS}</style>
      <PersistenceBridge state={state}/>
      <div className="app">
        <button onClick={toggleFullscreen}
          style={{position:"fixed",top:10,left:10,zIndex:9999,
            width:32,height:32,borderRadius:6,border:"1px solid rgba(255,255,255,0.15)",
            background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",
            display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
          {isFullscreen
            ? <Minimize size={14} color="#fff"/>
            : <Maximize size={14} color="#fff"/>}
        </button>
        <Suspense fallback={<LoadingFallback/>}>
          {state.view==="home"      &&<HomeScreen/>}
          {state.view==="addCourse" &&<AddCourseScreen
            onCancel={()=>dispatch({type:"SET_VIEW",v:"home"})}
            onSaved={(c)=>{ dispatch({type:"SET_COURSE",course:c}); dispatch({type:"SET_VIEW",v:"home"}); }}
          />}
          {state.view==="round"     &&<RoundScreen/>}
          {state.view==="review"    &&<ReviewScreen/>}
          {state.view==="history"   &&<HistoryScreen/>}
          {state.view==="profile"   &&<ProfileScreen/>}
          {state.view==="swing"     &&<SwingAnalyzerScreen/>}
        </Suspense>
      </div>
    </GameCtx.Provider>
  );
}
