import { useState, useRef, useEffect, useCallback, useReducer, createContext, useContext } from "react";
import { Maximize, Minimize } from "lucide-react";
import { useHubSocket } from "./useHubSocket";
import type { ShotDetectedPayload, BallPositionPayload, CartPayload } from "./useHubSocket";
import { HubStatusDot, HubStatusBar } from "./HubStatus";
import AddCourseScreen from "./AddCourseScreen";
import GlassesPanel from "./GlassesPanel";
import { useAuth } from "./AuthContext";
import { AuthScreen } from "./AuthScreen";
import {
  supabase, fetchCourses, createRound, updateRoundState, completeRound, fetchLatestActiveRound, fetchCompletedRounds, recordShot,
} from "./lib/supabase";
import type { Course, RoundRow } from "./lib/supabase";
import { SpeedInsights } from '@vercel/speed-insights/react';

// ── COLORS & CONSTANTS ────────────────────────────────────────────────────────
const NAVY = "#1B3A6B", GREEN = "#2E7D32", GOLD = "#C8960C";

const PLAYER_KEYS = ["p1", "p2", "p3", "p4"] as const;
type PlayerKey = typeof PLAYER_KEYS[number];

const PLAYER_COLORS: Record<PlayerKey, string> = {
  p1: "#60A5FA",  // blue
  p2: "#34D399",  // green
  p3: "#FB923C",  // orange
  p4: "#F472B6",  // pink
};

const CLUBS = [
  { name:"Driver",  abbr:"DR", avg:230, color:"#1B3A6B" },
  { name:"3-Wood",  abbr:"3W", avg:210, color:"#2E5EAA" },
  { name:"5-Wood",  abbr:"5W", avg:195, color:"#3A7FCC" },
  { name:"4-Iron",  abbr:"4I", avg:180, color:"#2E7D32" },
  { name:"5-Iron",  abbr:"5I", avg:170, color:"#388E3C" },
  { name:"6-Iron",  abbr:"6I", avg:160, color:"#43A047" },
  { name:"7-Iron",  abbr:"7I", avg:150, color:"#4CAF50" },
  { name:"8-Iron",  abbr:"8I", avg:138, color:"#66BB6A" },
  { name:"9-Iron",  abbr:"9I", avg:125, color:"#81C784" },
  { name:"PW",      abbr:"PW", avg:110, color:"#C8960C" },
  { name:"GW",      abbr:"GW", avg:95,  color:"#E0A020" },
  { name:"SW",      abbr:"SW", avg:80,  color:"#F0B030" },
  { name:"Putter",  abbr:"PT", avg:0,   color:"#6B7280" },
];

const DEFAULT_COURSE: Course = {
  id: "default",
  slug: "falcon-ridge",
  source: "default",
  location: "Boulder, CO",
  total_holes: 3,
  name: "Falcon Ridge GC",
  holes: [
    { number:1, par:4, yards:385,
      tee:{x:.15,y:.88}, pin:{x:.15,y:.13},
      fairway:[{x:.09,y:.88},{x:.21,y:.88},{x:.21,y:.32},{x:.18,y:.18},{x:.12,y:.18},{x:.09,y:.32}],
      green:[{x:.10,y:.13},{x:.20,y:.13},{x:.21,y:.08},{x:.09,y:.08}],
      hazards:[
        {type:"water", pts:[{x:.09,y:.55},{x:.14,y:.55},{x:.14,y:.63},{x:.09,y:.63}]},
        {type:"bunker",pts:[{x:.19,y:.26},{x:.23,y:.26},{x:.23,y:.32},{x:.19,y:.32}]},
      ],
      gps_tee:{lat:39.9785,lng:-105.2485},
      gps_pin:{lat:39.9820,lng:-105.2485},
      gps_fairway:[
        {lat:39.9785,lng:-105.2490},{lat:39.9785,lng:-105.2480},
        {lat:39.9810,lng:-105.2480},{lat:39.9817,lng:-105.2483},
        {lat:39.9817,lng:-105.2487},{lat:39.9810,lng:-105.2490},
      ],
      gps_green:[
        {lat:39.9818,lng:-105.2488},{lat:39.9818,lng:-105.2482},
        {lat:39.9822,lng:-105.2482},{lat:39.9822,lng:-105.2488},
      ],
      gps_hazards:[
        {type:"water", pts:[{lat:39.9798,lng:-105.2490},{lat:39.9798,lng:-105.2486},{lat:39.9802,lng:-105.2486},{lat:39.9802,lng:-105.2490}]},
        {type:"bunker",pts:[{lat:39.9813,lng:-105.2481},{lat:39.9813,lng:-105.2478},{lat:39.9815,lng:-105.2478},{lat:39.9815,lng:-105.2481}]},
      ],
    },
    { number:2, par:3, yards:165,
      tee:{x:.38,y:.85}, pin:{x:.38,y:.18},
      fairway:[{x:.33,y:.85},{x:.43,y:.85},{x:.43,y:.18},{x:.33,y:.18}],
      green:[{x:.34,y:.14},{x:.42,y:.14},{x:.43,y:.09},{x:.33,y:.09}],
      hazards:[
        {type:"bunker",pts:[{x:.31,y:.20},{x:.35,y:.20},{x:.35,y:.27},{x:.31,y:.27}]},
        {type:"bunker",pts:[{x:.41,y:.18},{x:.44,y:.18},{x:.44,y:.25},{x:.41,y:.25}]},
      ],
      gps_tee:{lat:39.9825,lng:-105.2470},
      gps_pin:{lat:39.9840,lng:-105.2470},
      gps_fairway:[
        {lat:39.9825,lng:-105.2474},{lat:39.9825,lng:-105.2466},
        {lat:39.9840,lng:-105.2466},{lat:39.9840,lng:-105.2474},
      ],
      gps_green:[
        {lat:39.9839,lng:-105.2473},{lat:39.9839,lng:-105.2467},
        {lat:39.9842,lng:-105.2467},{lat:39.9842,lng:-105.2473},
      ],
      gps_hazards:[
        {type:"bunker",pts:[{lat:39.9838,lng:-105.2475},{lat:39.9838,lng:-105.2473},{lat:39.9840,lng:-105.2473},{lat:39.9840,lng:-105.2475}]},
        {type:"bunker",pts:[{lat:39.9838,lng:-105.2467},{lat:39.9838,lng:-105.2465},{lat:39.9840,lng:-105.2465},{lat:39.9840,lng:-105.2467}]},
      ],
    },
    { number:3, par:5, yards:505,
      tee:{x:.62,y:.88}, pin:{x:.82,y:.15},
      fairway:[{x:.57,y:.88},{x:.67,y:.88},{x:.72,y:.60},{x:.85,y:.40},{x:.87,y:.22},{x:.80,y:.20},{x:.75,y:.38},{x:.62,y:.58},{x:.57,y:.75}],
      green:[{x:.78,y:.13},{x:.86,y:.13},{x:.87,y:.08},{x:.77,y:.08}],
      hazards:[
        {type:"water", pts:[{x:.67,y:.62},{x:.73,y:.62},{x:.75,y:.70},{x:.67,y:.70}]},
        {type:"trees", pts:[{x:.85,y:.40},{x:.92,y:.40},{x:.92,y:.60},{x:.85,y:.60}]},
      ],
      gps_tee:{lat:39.9845,lng:-105.2460},
      gps_pin:{lat:39.9870,lng:-105.2440},
      gps_fairway:[
        {lat:39.9845,lng:-105.2464},{lat:39.9845,lng:-105.2456},
        {lat:39.9855,lng:-105.2450},{lat:39.9865,lng:-105.2444},
        {lat:39.9870,lng:-105.2438},{lat:39.9868,lng:-105.2436},
        {lat:39.9862,lng:-105.2442},{lat:39.9852,lng:-105.2448},
        {lat:39.9845,lng:-105.2458},
      ],
      gps_green:[
        {lat:39.9869,lng:-105.2442},{lat:39.9869,lng:-105.2438},
        {lat:39.9872,lng:-105.2438},{lat:39.9872,lng:-105.2442},
      ],
      gps_hazards:[
        {type:"water", pts:[{lat:39.9852,lng:-105.2454},{lat:39.9852,lng:-105.2450},{lat:39.9855,lng:-105.2450},{lat:39.9855,lng:-105.2454}]},
        {type:"trees", pts:[{lat:39.9860,lng:-105.2444},{lat:39.9860,lng:-105.2440},{lat:39.9865,lng:-105.2440},{lat:39.9865,lng:-105.2444}]},
      ],
    },
  ]
};

function getScoreName(s: number, par: number){
  const d=s-par;
  if(s===1)return{l:"Hole in One!",c:"#FFD700"};
  if(d<=-2) return{l:"Eagle",c:"#FFD700"};
  if(d===-1)return{l:"Birdie",c:"#4CAF50"};
  if(d===0) return{l:"Par",c:"#93C5FD"};
  if(d===1) return{l:"Bogey",c:"#F87171"};
  return{l:`+${d}`,c:"#EF4444"};
}
function recommendClub(yards: number, wind=0){
  const adj=yards+wind;
  return [...CLUBS].filter(c=>c.abbr!=="PT").sort((a,b)=>Math.abs(a.avg-adj)-Math.abs(b.avg-adj))[0];
}

// ── STORE ─────────────────────────────────────────────────────────────────────
type ShotRecord = {x:number;y:number;dist:number;ts:number};
type ScoreRecord = {strokes:number;putts:number};

type State = {
  view: string;
  panel: string;
  currentHole: number;
  activePlayer: PlayerKey;
  round: {players: string[]; date: string} | null;
  shots: Record<PlayerKey, Record<number, ShotRecord[]>>;
  scores: Record<PlayerKey, Record<number, ScoreRecord>>;
  wind: {mph:number;dir:string};
  teeColor: string;
  course: Course;
  roundId: string | null;
};
type Action = {type:string;[key:string]:unknown};

const emptyPlayerData = (): Record<PlayerKey, Record<number, never>> =>
  ({ p1:{}, p2:{}, p3:{}, p4:{} });

const Ctx = createContext<{state:State;dispatch:React.Dispatch<Action>}|null>(null);
const init: State = {
  view:"home", panel:"map", currentHole:1, activePlayer:"p1",
  round:null,
  shots: emptyPlayerData() as Record<PlayerKey, Record<number, ShotRecord[]>>,
  scores: emptyPlayerData() as Record<PlayerKey, Record<number, ScoreRecord>>,
  wind:{mph:8,dir:"SW"}, teeColor:"white",
  course: DEFAULT_COURSE, roundId: null,
};

function reducer(s: State, a: Action): State {
  switch(a.type){
    case "START":      return{...init,course:s.course,round:a.p as State["round"],view:"round",currentHole:1};
    case "SET_COURSE": return{...s,course:a.course as Course};
    case "SET_ROUND_ID": return{...s,roundId:a.id as string|null};
    case "HYDRATE":    return{...s,...(a.patch as Partial<State>)};
    case "SET_HOLE":   return{...s,currentHole:a.n as number};
    case "SET_PLAYER": return{...s,activePlayer:a.p as PlayerKey};
    case "SET_PANEL":  return{...s,panel:a.p as string};
    case "SET_VIEW":   return{...s,view:a.v as string};
    case "ADD_SHOT":{
      const pl=a.pl as PlayerKey,hn=a.hn as number,sh=a.sh as ShotRecord;
      return{...s,shots:{...s.shots,[pl]:{...s.shots[pl],[hn]:[...(s.shots[pl][hn]||[]),sh]}}};
    }
    case "UNDO":{
      const pl=a.pl as PlayerKey,hn=a.hn as number;
      return{...s,shots:{...s.shots,[pl]:{...s.shots[pl],[hn]:(s.shots[pl][hn]||[]).slice(0,-1)}}};
    }
    case "SCORE":{
      const ex=s.scores[a.pl as PlayerKey][a.hn as number]||{strokes:0,putts:0};
      return{...s,scores:{...s.scores,[a.pl as string]:{...s.scores[a.pl as PlayerKey],[a.hn as number]:{...ex,[a.f as string]:a.v}}}};
    }
    case "WIND":    return{...s,wind:a.w as {mph:number;dir:string}};
    case "END":     return{...s,view:"review"};
    case "RESET":   return init;
    default: return s;
  }
}

function useGame(){return useContext(Ctx)!;}

// Returns the active player keys for the current round (p1...pN)
function usePlayers(): PlayerKey[] {
  const {state} = useGame();
  const n = state.round?.players.length ?? 2;
  return PLAYER_KEYS.slice(0, n);
}

// ── CSS ───────────────────────────────────────────────────────────────────────
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

// ── SHOT MAP ──────────────────────────────────────────────────────────────────
type Hole = Course["holes"][number];

function ShotMap({hole, ballPositions, cart}: {hole: Hole; ballPositions?: Record<string, BallPositionPayload>; cart?: CartPayload | null}){
  const {state,dispatch}=useGame();
  const players = usePlayers();
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [mapMode,setMapMode]=useState<"satellite"|"chart">("satellite");

  const shotsByPlayer = Object.fromEntries(
    players.map(pk => [pk, state.shots[pk][hole.number] || []])
  );

  const draw=useCallback(()=>{
    const cv=canvasRef.current; if(!cv)return;
    const ctx=cv.getContext("2d");
    if(!ctx)return;
    const W=cv.width,H=cv.height;
    ctx.clearRect(0,0,W,H);

    const satellite = mapMode === "satellite";

    // Seeded pseudo-random for stable noise per hole
    let seed = hole.number * 9301 + 49297;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

    if(satellite){
      // Base: dark rough with mottled noise, evoking aerial imagery
      const baseGrad = ctx.createLinearGradient(0,0,W,H);
      baseGrad.addColorStop(0,"#2D4A1E");
      baseGrad.addColorStop(0.5,"#1F3A14");
      baseGrad.addColorStop(1,"#16300E");
      ctx.fillStyle = baseGrad; ctx.fillRect(0,0,W,H);

      // Mottled rough noise
      for(let i=0;i<420;i++){
        const x=rand()*W, y=rand()*H, r=1+rand()*3;
        const shade = Math.floor(rand()*35);
        ctx.fillStyle = `rgba(${30+shade},${60+shade},${20+shade},0.6)`;
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      }
      // Highlight specks
      for(let i=0;i<120;i++){
        const x=rand()*W, y=rand()*H;
        ctx.fillStyle = `rgba(140,170,90,${0.05+rand()*0.08})`;
        ctx.fillRect(x,y,1,1);
      }
    } else {
      ctx.fillStyle="#1A3D0A"; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle="rgba(255,255,255,0.025)"; ctx.lineWidth=1;
      for(let x=0;x<W;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
      for(let y=0;y<H;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    }

    const p=(pt:{x:number;y:number})=>({x:pt.x*W,y:pt.y*H});

    const polyPath = (pts:{x:number;y:number}[])=>{
      ctx.beginPath();
      pts.forEach((pt,i)=>{ const cp=p(pt); i===0?ctx.moveTo(cp.x,cp.y):ctx.lineTo(cp.x,cp.y); });
      ctx.closePath();
    };

    const hc: Record<string,{fill:string;stroke:string}> = satellite ? {
      water:{fill:"#1B4F8C",stroke:"#0E2E5A"},
      bunker:{fill:"#E8D59A",stroke:"#B8A060"},
      trees:{fill:"#0F2A12",stroke:"#0A1A0A"},
    } : {
      water:{fill:"rgba(20,80,200,0.45)",stroke:"#1E64C8"},
      bunker:{fill:"rgba(230,200,100,0.65)",stroke:"#C8A000"},
      trees:{fill:"rgba(10,80,20,0.55)",stroke:"#0A6010"},
    };

    hole.hazards?.forEach(hz=>{
      const c=hc[hz.type]; if(!c)return;
      if(satellite && hz.type === "trees"){
        // Soft shadow beneath canopy
        ctx.save();
        ctx.translate(3,4);
        ctx.fillStyle="rgba(0,0,0,0.45)";
        polyPath(hz.pts); ctx.fill();
        ctx.restore();
        // Canopy base
        ctx.fillStyle=c.fill; polyPath(hz.pts); ctx.fill();
        // Bumpy canopy texture
        ctx.save(); polyPath(hz.pts); ctx.clip();
        for(let i=0;i<260;i++){
          const x=rand()*W, y=rand()*H;
          const r=2+rand()*4;
          const shade = Math.floor(rand()*40);
          ctx.fillStyle=`rgba(${20+shade},${60+shade},${25+shade},0.75)`;
          ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
        }
        ctx.restore();
      } else if(satellite && hz.type === "water"){
        // Water depth gradient
        const cp0 = p(hz.pts[0]);
        const wg = ctx.createRadialGradient(cp0.x,cp0.y,0,cp0.x,cp0.y,Math.max(W,H)*0.4);
        wg.addColorStop(0,"#2E6FAE"); wg.addColorStop(1,"#0D2548");
        ctx.fillStyle=wg; polyPath(hz.pts); ctx.fill();
        // Specular sheen lines
        ctx.save(); polyPath(hz.pts); ctx.clip();
        ctx.strokeStyle="rgba(255,255,255,0.12)"; ctx.lineWidth=1;
        for(let i=0;i<14;i++){
          const y = rand()*H;
          ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y+rand()*3-1.5); ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle=c.stroke; ctx.lineWidth=1.5; polyPath(hz.pts); ctx.stroke();
      } else if(satellite && hz.type === "bunker"){
        // Sand with grain
        ctx.fillStyle=c.fill; polyPath(hz.pts); ctx.fill();
        ctx.save(); polyPath(hz.pts); ctx.clip();
        for(let i=0;i<180;i++){
          const x=rand()*W, y=rand()*H;
          ctx.fillStyle=`rgba(${180+Math.floor(rand()*40)},${160+Math.floor(rand()*30)},${110+Math.floor(rand()*20)},0.5)`;
          ctx.fillRect(x,y,1,1);
        }
        ctx.restore();
        ctx.strokeStyle=c.stroke; ctx.lineWidth=1; polyPath(hz.pts); ctx.stroke();
      } else {
        ctx.fillStyle=c.fill; ctx.strokeStyle=c.stroke; ctx.lineWidth=1.5;
        polyPath(hz.pts); ctx.fill(); ctx.stroke();
      }
    });

    // Fairway
    if(satellite){
      // Drop shadow under fairway for depth
      ctx.save();
      ctx.shadowColor="rgba(0,0,0,0.35)";
      ctx.shadowBlur=8; ctx.shadowOffsetY=2;
      ctx.fillStyle="#4A7A2B";
      polyPath(hole.fairway); ctx.fill();
      ctx.restore();

      // Mow-line striping inside fairway
      ctx.save(); polyPath(hole.fairway); ctx.clip();
      for(let y=0;y<H;y+=14){
        ctx.fillStyle = (Math.floor(y/14)%2===0) ? "rgba(90,140,55,0.35)" : "rgba(60,100,35,0.35)";
        ctx.fillRect(0,y,W,14);
      }
      // Fairway grain noise
      for(let i=0;i<260;i++){
        const x=rand()*W, y=rand()*H;
        ctx.fillStyle=`rgba(${60+Math.floor(rand()*40)},${110+Math.floor(rand()*40)},${40+Math.floor(rand()*25)},0.4)`;
        ctx.fillRect(x,y,1,1);
      }
      ctx.restore();

      // Soft fairway edge (rough-to-fairway blend)
      ctx.save();
      ctx.strokeStyle="rgba(30,55,15,0.6)"; ctx.lineWidth=3;
      polyPath(hole.fairway); ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle="#2D5A1B";
      polyPath(hole.fairway); ctx.fill();
    }

    // Green
    if(satellite){
      ctx.save();
      ctx.shadowColor="rgba(0,0,0,0.4)"; ctx.shadowBlur=6; ctx.shadowOffsetY=2;
      const gg = ctx.createRadialGradient(
        p(hole.pin).x, p(hole.pin).y, 2,
        p(hole.pin).x, p(hole.pin).y, Math.max(W,H)*0.18);
      gg.addColorStop(0,"#8CC36A"); gg.addColorStop(1,"#4E8A30");
      ctx.fillStyle=gg; polyPath(hole.green); ctx.fill();
      ctx.restore();
      // Fine grain
      ctx.save(); polyPath(hole.green); ctx.clip();
      for(let i=0;i<160;i++){
        const x=rand()*W, y=rand()*H;
        ctx.fillStyle=`rgba(255,255,255,${0.02+rand()*0.05})`;
        ctx.fillRect(x,y,1,1);
      }
      ctx.restore();
      ctx.strokeStyle="rgba(255,255,255,0.18)"; ctx.lineWidth=1;
      polyPath(hole.green); ctx.stroke();
    } else {
      ctx.fillStyle="#388A1E";
      polyPath(hole.green); ctx.fill();
      ctx.strokeStyle="rgba(255,255,255,0.1)"; ctx.lineWidth=1; ctx.stroke();
    }

    const pin=p(hole.pin);
    ctx.strokeStyle="#fff"; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(pin.x,pin.y+14); ctx.lineTo(pin.x,pin.y-16); ctx.stroke();
    ctx.fillStyle="#EF4444";
    ctx.beginPath(); ctx.moveTo(pin.x,pin.y-16); ctx.lineTo(pin.x+11,pin.y-11); ctx.lineTo(pin.x,pin.y-6); ctx.closePath(); ctx.fill();
    ctx.fillStyle="rgba(239,68,68,0.2)"; ctx.beginPath(); ctx.arc(pin.x,pin.y,8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(pin.x,pin.y,4,0,Math.PI*2); ctx.fill();

    const drawTrail=(shots: ShotRecord[], col: string)=>{
      if(!shots.length)return;
      for(let i=0;i<shots.length-1;i++){
        const a=p(shots[i]),b=p(shots[i+1]);
        const mx=(a.x+b.x)/2,my=(a.y+b.y)/2-22;
        ctx.strokeStyle=col; ctx.lineWidth=2; ctx.setLineDash([5,4]);
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.quadraticCurveTo(mx,my,b.x,b.y); ctx.stroke(); ctx.setLineDash([]);
        const t=0.6;
        const ax=(1-t)**2*a.x+2*(1-t)*t*mx+t*t*b.x;
        const ay=(1-t)**2*a.y+2*(1-t)*t*my+t*t*b.y;
        const dx=2*(1-t)*(mx-a.x)+2*t*(b.x-mx);
        const dy=2*(1-t)*(my-a.y)+2*t*(b.y-my);
        const ang=Math.atan2(dy,dx);
        ctx.fillStyle=col;
        ctx.beginPath(); ctx.moveTo(ax+Math.cos(ang)*6,ay+Math.sin(ang)*6);
        ctx.lineTo(ax+Math.cos(ang+2.5)*4,ay+Math.sin(ang+2.5)*4);
        ctx.lineTo(ax+Math.cos(ang-2.5)*4,ay+Math.sin(ang-2.5)*4);
        ctx.closePath(); ctx.fill();
      }
      shots.forEach((sh,idx)=>{
        const c=p(sh);
        const g=ctx.createRadialGradient(c.x,c.y,0,c.x,c.y,14);
        g.addColorStop(0,col+"50"); g.addColorStop(1,"transparent");
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(c.x,c.y,14,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=col; ctx.strokeStyle="#000"; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(c.x,c.y,7,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle="#000"; ctx.font="bold 8px monospace"; ctx.textAlign="center";
        ctx.fillText(String(idx+1),c.x,c.y+3); ctx.textAlign="left";
        if(sh.dist){
          ctx.fillStyle="rgba(0,0,0,0.75)";
          ctx.fillRect(c.x+10,c.y-10,34,13);
          ctx.fillStyle=col; ctx.font="9px monospace";
          ctx.fillText(`${sh.dist}y`,c.x+13,c.y);
        }
      });
    };

    players.forEach(pk => drawTrail(shotsByPlayer[pk] || [], PLAYER_COLORS[pk]));

    // Cart marker (with heading arrow + UWB ranging beams)
    let cartCanvas: {x:number;y:number} | null = null;
    if(cart && cart.canvasX!=null && cart.canvasY!=null){
      cartCanvas = p({x: cart.canvasX, y: cart.canvasY});
      const heading = cart.headingDeg ?? 0;
      const ang = (heading - 90) * Math.PI / 180;  // canvas: 0deg = +x → rotate

      // UWB ranging beams from cart to each ball
      if(ballPositions){
        for(const [,bp] of Object.entries(ballPositions)){
          const c=p(bp);
          ctx.strokeStyle="rgba(200,150,12,0.35)";
          ctx.lineWidth=1; ctx.setLineDash([3,3]);
          ctx.beginPath(); ctx.moveTo(cartCanvas.x,cartCanvas.y); ctx.lineTo(c.x,c.y); ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Cart range halo (UWB coverage radius ~30m)
      const haloR = 30 / 150 * Math.min(W, H);
      const haloG = ctx.createRadialGradient(cartCanvas.x,cartCanvas.y,0,cartCanvas.x,cartCanvas.y,haloR);
      haloG.addColorStop(0,"rgba(200,150,12,0.10)"); haloG.addColorStop(1,"transparent");
      ctx.fillStyle=haloG; ctx.beginPath(); ctx.arc(cartCanvas.x,cartCanvas.y,haloR,0,Math.PI*2); ctx.fill();

      // Cart body
      ctx.save();
      ctx.translate(cartCanvas.x,cartCanvas.y);
      ctx.rotate(ang);
      ctx.fillStyle="#0F2444";
      ctx.strokeStyle=GOLD; ctx.lineWidth=2;
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(-9,-13,18,26,3); else ctx.rect(-9,-13,18,26);
      ctx.fill(); ctx.stroke();
      // Heading arrow
      ctx.fillStyle=GOLD;
      ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(6,-9); ctx.lineTo(-6,-9); ctx.closePath(); ctx.fill();
      // Antenna dots (4 corners)
      ctx.fillStyle="#fff";
      [[-7,-10],[7,-10],[-7,10],[7,10]].forEach(([x,y])=>{
        ctx.beginPath(); ctx.arc(x,y,1.8,0,Math.PI*2); ctx.fill();
      });
      ctx.restore();

      // Cart label
      ctx.fillStyle="rgba(0,0,0,0.7)";
      ctx.fillRect(cartCanvas.x+12,cartCanvas.y-8,38,14);
      ctx.fillStyle=GOLD; ctx.font="bold 9px 'IBM Plex Mono',monospace"; ctx.textAlign="left";
      ctx.fillText("CART",cartCanvas.x+15,cartCanvas.y+2);
    }

    // Live UWB ball positions — pulsing dots on the map
    if(ballPositions){
      const ballToPlayer: Record<string, PlayerKey> = {ball1:"p1",ball2:"p2",ball3:"p3",ball4:"p4"};
      const now=Date.now();
      for(const [id,bp] of Object.entries(ballPositions)){
        const pk = ballToPlayer[id] as PlayerKey | undefined;
        const col = pk ? PLAYER_COLORS[pk] : "#FBBF24";
        const c=p(bp);
        const pulse=0.5+0.5*Math.sin((now%1200)/1200*Math.PI*2);
        const r=8+pulse*6;
        const g=ctx.createRadialGradient(c.x,c.y,0,c.x,c.y,r+8);
        g.addColorStop(0,col+"90"); g.addColorStop(0.6,col+"30"); g.addColorStop(1,"transparent");
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(c.x,c.y,r+8,0,Math.PI*2); ctx.fill();
        ctx.fillStyle=col; ctx.strokeStyle="#fff"; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(c.x,c.y,6,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle="#000"; ctx.font="bold 7px monospace"; ctx.textAlign="center";
        ctx.fillText(id.replace("ball","B"),c.x,c.y+2.5); ctx.textAlign="left";
      }
    }

    // Tornado whirlwind when ball is in the cup
    const pinThreshold = 0.03; // normalized distance threshold to consider "holed"
    let holedPlayer: PlayerKey | null = null;
    for(const pk of players){
      const shots = shotsByPlayer[pk] || [];
      if(shots.length > 0){
        const last = shots[shots.length - 1];
        const dx = last.x - hole.pin.x;
        const dy = last.y - hole.pin.y;
        if(Math.sqrt(dx*dx + dy*dy) < pinThreshold){
          holedPlayer = pk;
          break;
        }
      }
    }

    if(holedPlayer){
      const now = Date.now();
      const t = (now % 2000) / 2000;
      const px = pin.x, py = pin.y;

      // Outer glow pulse
      const glowR = 35 + Math.sin(t * Math.PI * 2) * 8;
      const glowG = ctx.createRadialGradient(px, py, 0, px, py, glowR);
      glowG.addColorStop(0, "rgba(251,146,60,0.4)");
      glowG.addColorStop(0.5, "rgba(251,146,60,0.15)");
      glowG.addColorStop(1, "transparent");
      ctx.fillStyle = glowG;
      ctx.beginPath(); ctx.arc(px, py, glowR, 0, Math.PI * 2); ctx.fill();

      // Spinning spiral arms (tornado vortex)
      for(let arm = 0; arm < 5; arm++){
        const baseAngle = t * Math.PI * 2 + (arm / 5) * Math.PI * 2;
        ctx.save();
        ctx.globalAlpha = 0.7 - arm * 0.08;
        ctx.strokeStyle = arm % 2 === 0 ? "#FB923C" : "#FDBA74";
        ctx.lineWidth = 2.5 - arm * 0.3;
        ctx.beginPath();
        for(let s = 0; s < 40; s++){
          const frac = s / 40;
          const r = 4 + frac * 28;
          const angle = baseAngle + frac * Math.PI * 3;
          const x = px + Math.cos(angle) * r;
          const y = py + Math.sin(angle) * r * 0.7 - frac * 12;
          if(s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Particles swirling outward
      for(let i = 0; i < 12; i++){
        const particleT = (t + i / 12) % 1;
        const angle = particleT * Math.PI * 4 + i * 1.3;
        const r = 6 + particleT * 26;
        const x = px + Math.cos(angle) * r;
        const y = py + Math.sin(angle) * r * 0.6 - particleT * 18;
        const size = 1.5 + (1 - particleT) * 2;
        const alpha = 1 - particleT;
        ctx.fillStyle = `rgba(251,146,60,${alpha})`;
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
      }

      // Center "IN THE CUP" burst
      ctx.save();
      ctx.fillStyle = "#FB923C";
      ctx.font = "bold 10px 'IBM Plex Mono',monospace";
      ctx.textAlign = "center";
      const labelY = py + 32 + Math.sin(t * Math.PI * 4) * 2;
      ctx.shadowColor = "#FB923C"; ctx.shadowBlur = 8;
      ctx.fillText("IN THE CUP!", px, labelY);
      ctx.restore();
      ctx.textAlign = "left";
    }

    const tee=p(hole.tee);
    ctx.fillStyle="#fff"; ctx.strokeStyle=NAVY; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(tee.x,tee.y,8,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle=NAVY; ctx.font="bold 8px monospace"; ctx.textAlign="center";
    ctx.fillText("T",tee.x,tee.y+3); ctx.textAlign="left";

    ctx.fillStyle="rgba(0,0,0,0.7)";
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(8,8,90,46,6);
    ctx.fill();
    ctx.fillStyle=GOLD; ctx.font="bold 10px 'IBM Plex Mono',monospace";
    ctx.fillText(`HOLE ${hole.number}`,14,26);
    ctx.fillStyle="#fff"; ctx.font="bold 9px 'IBM Plex Mono',monospace";
    ctx.fillText(`PAR ${hole.par}  •  ${hole.yards}Y`,14,42);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[hole, JSON.stringify(shotsByPlayer), ballPositions, cart, players, mapMode]);

  useEffect(()=>{draw();},[draw]);

  useEffect(()=>{
    const hasHoled = players.some(pk=>{
      const shots = shotsByPlayer[pk] || [];
      if(shots.length === 0) return false;
      const last = shots[shots.length - 1];
      const dx = last.x - hole.pin.x, dy = last.y - hole.pin.y;
      return Math.sqrt(dx*dx + dy*dy) < 0.03;
    });
    const hasLive = (ballPositions && Object.keys(ballPositions).length>0) || cart || hasHoled;
    if(!hasLive) return;
    let raf: number;
    const loop=()=>{ draw(); raf=requestAnimationFrame(loop); };
    raf=requestAnimationFrame(loop);
    return ()=>cancelAnimationFrame(raf);
  },[ballPositions,cart,draw,players,shotsByPlayer,hole.pin.x,hole.pin.y]);

  const handleTap=useCallback((e: React.MouseEvent<HTMLCanvasElement>)=>{
    const cv=canvasRef.current; if(!cv)return;
    const r=cv.getBoundingClientRect();
    const x=((e.clientX-r.left)/r.width);
    const y=((e.clientY-r.top)/r.height);
    const shots=state.shots[state.activePlayer][hole.number]||[];
    const prev=shots.length>0?shots[shots.length-1]:hole.tee;
    const dx=(x-prev.x)*hole.yards, dy=(y-prev.y)*hole.yards;
    const dist=Math.round(Math.sqrt(dx*dx+dy*dy));
    dispatch({type:"ADD_SHOT",pl:state.activePlayer,hn:hole.number,sh:{x,y,dist,ts:Date.now()}});
  },[hole,state.activePlayer,state.shots,dispatch]);

  return(
    <div style={{position:"relative",width:"100%"}}>
      <canvas ref={canvasRef} width={580} height={440} onClick={handleTap}
        style={{width:"100%",height:440,cursor:"crosshair",borderRadius:8,border:"1px solid rgba(255,255,255,0.08)",display:"block"}}/>
      <div style={{position:"absolute",bottom:8,left:8,display:"flex",background:"rgba(0,0,0,0.7)",
        border:`1px solid ${GOLD}40`,borderRadius:6,overflow:"hidden"}}>
        {(["satellite","chart"] as const).map(m=>(
          <button key={m} onClick={()=>setMapMode(m)}
            style={{padding:"5px 10px",border:"none",cursor:"pointer",
              background: mapMode===m ? GOLD : "transparent",
              color: mapMode===m ? "#000" : "#fff",
              fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:1,fontWeight:700}}>
            {m.toUpperCase()}
          </button>
        ))}
      </div>
      {cart && cart.lat!=null && (
        <div style={{position:"absolute",bottom:44,left:8,background:"rgba(0,0,0,0.7)",
          borderRadius:6,padding:"6px 10px",border:`1px solid ${GOLD}40`,
          fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:"#fff",lineHeight:1.5}}>
          <div style={{color:GOLD,fontWeight:700,letterSpacing:1}}>CART TELEMETRY</div>
          <div>HDG {cart.headingDeg!=null?Math.round(cart.headingDeg):"—"}°</div>
          <div>SPD {(cart.speedMps*2.237).toFixed(1)} mph</div>
          <div style={{color:"#9CA3AF"}}>{cart.lat.toFixed(5)}, {cart.lng?.toFixed(5)}</div>
        </div>
      )}
      <div style={{position:"absolute",top:8,right:8,display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end",zIndex:1000}}>
        {players.map(pk=>(
          <div key={pk} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(0,0,0,0.65)",borderRadius:4,padding:"3px 8px"}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:PLAYER_COLORS[pk]}}/>
            <span style={{color:"#fff",fontSize:10,fontFamily:"'IBM Plex Mono',monospace"}}>
              {state.round?.players[PLAYER_KEYS.indexOf(pk)]||pk.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CLUB RECOMMENDER ─────────────────────────────────────────────────────────
function ClubPanel({hole: _hole, autoYards}: {hole: Hole; autoYards: number | null}){
  void _hole;
  const {state,dispatch}=useGame();
  const [yards,setYards]=useState("");
  const [manual,setManual]=useState(false);
  const wind=state.wind;
  const windAdj=["N","NE","NW"].includes(wind.dir)?wind.mph:-Math.round(wind.mph*0.7);
  const effectiveYards = manual ? +yards : (autoYards ?? +yards);
  const rec=effectiveYards>0?recommendClub(effectiveYards,windAdj):null;
  const DIRS=["N","NE","E","SE","S","SW","W","NW"];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:10,height:"100%",overflowY:"auto"}}>
      <div style={{background:"rgba(255,255,255,0.05)",borderRadius:8,padding:"10px 12px"}}>
        <div style={{color:"#93C5FD",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:1,marginBottom:8}}>WIND</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:8}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,flex:1}}>
            {DIRS.map(d=>(
              <button key={d} onClick={()=>dispatch({type:"WIND",w:{...wind,dir:d}})}
                style={{padding:"4px 7px",borderRadius:3,border:"none",fontSize:9,fontFamily:"'IBM Plex Mono',monospace",cursor:"pointer",
                  background:wind.dir===d?NAVY:"rgba(255,255,255,0.08)",color:wind.dir===d?"#fff":"#9CA3AF"}}>{d}</button>
            ))}
          </div>
          <div style={{textAlign:"center",flexShrink:0}}>
            <WindArrow dir={wind.dir} mph={wind.mph}/>
          </div>
        </div>
        <input type="range" min={0} max={25} value={wind.mph}
          onChange={e=>dispatch({type:"WIND",w:{...wind,mph:+e.target.value}})}
          style={{width:"100%",accentColor:"#60A5FA"}}/>
        <div style={{display:"flex",justifyContent:"space-between",color:"#9CA3AF",fontSize:9,fontFamily:"'IBM Plex Mono',monospace",marginTop:3}}>
          <span>0</span><span style={{color:"#fff",fontWeight:700}}>{wind.mph} MPH {wind.dir}</span><span>25</span>
        </div>
      </div>

      <div style={{background:"rgba(255,255,255,0.05)",borderRadius:8,padding:"10px 12px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{color:"#93C5FD",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:1}}>DISTANCE TO PIN</div>
          {autoYards!=null && (
            <div style={{display:"flex",alignItems:"center",gap:4,fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color: manual ? "#9CA3AF" : GOLD}}>
              <span style={{width:6,height:6,borderRadius:"50%",background: manual ? "#9CA3AF" : GOLD,boxShadow: manual ? "none" : `0 0 6px ${GOLD}`}}/>
              UWB LIVE
            </div>
          )}
        </div>
        {autoYards!=null && !manual ? (
          <div style={{display:"flex",gap:8,alignItems:"baseline",marginBottom:8}}>
            <div style={{flex:1,padding:"9px 10px",borderRadius:6,background:`linear-gradient(135deg,${GOLD}15,${GOLD}05)`,
              border:`1px solid ${GOLD}55`,color:"#fff",fontSize:24,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace"}}>
              {autoYards}
            </div>
            <span style={{color:GOLD,fontSize:12,fontFamily:"'IBM Plex Mono',monospace"}}>yds</span>
            <button onClick={()=>{setManual(true);setYards(String(autoYards));}}
              style={{padding:"6px 9px",borderRadius:4,border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.06)",
                color:"#D1D5DB",fontSize:9,fontFamily:"'IBM Plex Mono',monospace",cursor:"pointer",letterSpacing:0.5}}>OVERRIDE</button>
          </div>
        ) : (
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
            <input type="number" value={yards} onChange={e=>setYards(e.target.value)} placeholder="Yards..."
              style={{flex:1,padding:"9px 10px",borderRadius:6,background:"rgba(255,255,255,0.1)",
                border:"1px solid rgba(255,255,255,0.2)",color:"#fff",fontSize:20,fontFamily:"'IBM Plex Mono',monospace",outline:"none"}}/>
            <span style={{color:"#9CA3AF",fontSize:12,fontFamily:"'IBM Plex Mono',monospace"}}>yds</span>
            {autoYards!=null && manual && (
              <button onClick={()=>{setManual(false);setYards("");}}
                style={{padding:"6px 9px",borderRadius:4,border:"none",background:GOLD,color:"#000",
                  fontSize:9,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",cursor:"pointer",letterSpacing:0.5}}>USE UWB</button>
            )}
          </div>
        )}
        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
          {[50,75,100,125,150,175,200,225].map(y=>(
            <button key={y} onClick={()=>setYards(String(y))}
              style={{padding:"4px 9px",borderRadius:4,border:"none",cursor:"pointer",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
                background:yards==String(y)?GREEN:"rgba(255,255,255,0.08)",color:yards==String(y)?"#fff":"#D1D5DB"}}>{y}</button>
          ))}
        </div>
      </div>

      {rec&&(
        <div style={{background:`linear-gradient(135deg,${NAVY}ee 0%,#0F2444 100%)`,borderRadius:8,padding:"12px 14px",border:`1px solid ${GOLD}55`}}>
          <div style={{color:GOLD,fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:1,marginBottom:8}}>RECOMMENDED</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:60,height:60,borderRadius:8,background:rec.color,display:"flex",alignItems:"center",justifyContent:"center",
              fontWeight:700,fontSize:18,color:"#fff",boxShadow:`0 0 18px ${rec.color}70`,fontFamily:"'IBM Plex Mono',monospace"}}>{rec.abbr}</div>
            <div>
              <div style={{color:"#fff",fontWeight:700,fontSize:22}}>{rec.name}</div>
              <div style={{color:"#9CA3AF",fontSize:12,fontFamily:"'IBM Plex Mono',monospace",marginTop:2}}>Avg: {rec.avg}y</div>
              {windAdj!==0&&<div style={{color:windAdj>0?"#F87171":"#34D399",fontSize:10,fontFamily:"'IBM Plex Mono',monospace",marginTop:2}}>
                {windAdj>0?"↑ into":"↓ down"} wind: {Math.abs(windAdj)}y adj
              </div>}
            </div>
          </div>
        </div>
      )}

      <div>
        <div style={{color:"#93C5FD",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:1,marginBottom:8}}>ALL CLUBS</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
          {CLUBS.map(cl=>(
            <div key={cl.abbr} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 9px",borderRadius:5,cursor:"pointer",
              background:rec?.abbr===cl.abbr?`${cl.color}30`:"rgba(255,255,255,0.04)",
              outline:rec?.abbr===cl.abbr?`1px solid ${cl.color}`:"none"}}>
              <div style={{width:26,height:26,borderRadius:4,background:cl.color,display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:9,color:"#fff",flexShrink:0}}>{cl.abbr}</div>
              <div>
                <div style={{color:"#fff",fontSize:11}}>{cl.name}</div>
                <div style={{color:"#9CA3AF",fontSize:9,fontFamily:"'IBM Plex Mono',monospace"}}>
                  {cl.abbr==="PT" ? "Green" : `${cl.avg}y`}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── GAPP PANEL ──────────────────────────────────────────────────────────────
function GAPPPanel(){
  const [expanded,setExpanded]=useState<string|null>(null);

  const sections: {id:string;title:string;icon:string;color:string;tips:string[];detail:string}[] = [
    {
      id:"grip", title:"Grip", icon:"G", color:"#60A5FA",
      tips:[
        "Neutral grip: V's of both hands point to trail shoulder",
        "Light pressure (4/10) for feel; firm with trail hand pinkie overlap",
        "Lead hand: last 3 fingers secure the club",
        "Check: club runs from base of pinkie to mid-index finger"
      ],
      detail:"The grip is the only connection between you and the club. A neutral grip returns the face square at impact. Too strong (V's past trail shoulder) closes the face; too weak opens it."
    },
    {
      id:"aim", title:"Aim", icon:"A", color:"#34D399",
      tips:[
        "Clubface aims at the target FIRST, then align body",
        "Feet, hips, and shoulders parallel-left of target line",
        "Pick an intermediate spot 2-3 feet ahead on the target line",
        "Check alignment by laying a club across your toes"
      ],
      detail:"80% of directional misses start with misalignment. The face angle at impact determines 75-85% of the ball's starting direction. Body alignment influences the swing path."
    },
    {
      id:"posture", title:"Posture", icon:"P", color:"#FB923C",
      tips:[
        "Bend from the hips, not the waist — maintain spine angle",
        "Slight knee flex, weight on balls of feet",
        "Arms hang naturally below shoulders",
        "Chin up off chest to allow shoulder turn"
      ],
      detail:"Good posture allows the arms to swing freely and the body to rotate. A hunched back restricts rotation and leads to compensations. Maintain your spine angle through impact."
    },
    {
      id:"position", title:"Position", icon:"P", color:"#F472B6",
      tips:[
        "Driver: ball off lead heel, widest stance",
        "Irons: ball center to one ball forward of center",
        "Wedges: center of stance, narrower width",
        "Weight: 50/50 for irons, 55% trail side for driver"
      ],
      detail:"Ball position controls the low point of the arc. Too far forward = thin/topped. Too far back = fat/heavy. Stance width determines your base of support and rotation capacity."
    },
  ];

  const facePathInfo = {
    title: "Club Face & Path",
    items: [
      { label:"Face Closed + In-to-Out", result:"Draw / Hook", color:"#34D399" },
      { label:"Face Open + Out-to-In", result:"Fade / Slice", color:"#60A5FA" },
      { label:"Face Square + On Path", result:"Straight", color:"#C8960C" },
      { label:"Face Open + In-to-Out", result:"Push / Push-Fade", color:"#FB923C" },
      { label:"Face Closed + Out-to-In", result:"Pull / Pull-Hook", color:"#F472B6" },
    ],
    principles: [
      "Club face at impact determines ~75% of initial ball direction",
      "Path relative to face determines spin axis (curve)",
      "Leading edge perpendicular to face angle, not the path",
      "Attack angle affects launch and spin: negative = descending blow"
    ]
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12,overflowY:"auto"}}>
      {/* GAPP Header */}
      <div style={{background:"linear-gradient(135deg,#0F2444 0%,#1B3A6B 100%)",borderRadius:10,padding:"14px 16px",
        border:`1px solid ${GOLD}40`}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <div style={{display:"flex",gap:3}}>
            {sections.map(s=>(
              <div key={s.id} style={{width:28,height:28,borderRadius:6,background:s.color,display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:13,color:"#fff"}}>{s.icon}</div>
            ))}
          </div>
          <div>
            <div style={{color:"#fff",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:18}}>Pre-Shot Checklist</div>
            <div style={{color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:9}}>Grip - Aim - Posture - Position</div>
          </div>
        </div>
      </div>

      {/* GAPP Sections */}
      {sections.map(s=>{
        const isOpen=expanded===s.id;
        return(
          <div key={s.id} style={{background:"rgba(255,255,255,0.04)",borderRadius:8,border:`1px solid ${isOpen?s.color+"60":"rgba(255,255,255,0.08)"}`,
            overflow:"hidden",transition:"border-color 0.2s"}}>
            <button onClick={()=>setExpanded(isOpen?null:s.id)}
              style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"11px 14px",border:"none",background:"transparent",cursor:"pointer",textAlign:"left"}}>
              <div style={{width:32,height:32,borderRadius:7,background:`${s.color}20`,border:`1px solid ${s.color}60`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:14,color:s.color,flexShrink:0}}>{s.icon}</div>
              <div style={{flex:1}}>
                <div style={{color:"#fff",fontWeight:600,fontSize:15,fontFamily:"'Rajdhani',sans-serif"}}>{s.title}</div>
                <div style={{color:"#9CA3AF",fontSize:10,fontFamily:"'IBM Plex Mono',monospace",marginTop:1}}>{s.tips[0]}</div>
              </div>
              <div style={{color:s.color,fontSize:16,transform:isOpen?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}>▼</div>
            </button>
            {isOpen && (
              <div style={{padding:"0 14px 14px",borderTop:`1px solid ${s.color}20`}}>
                <div style={{padding:"10px 0",display:"flex",flexDirection:"column",gap:6}}>
                  {s.tips.map((tip,i)=>(
                    <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                      <div style={{width:18,height:18,borderRadius:4,background:`${s.color}15`,border:`1px solid ${s.color}40`,
                        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                        fontFamily:"'IBM Plex Mono',monospace",fontSize:9,color:s.color,fontWeight:700}}>{i+1}</div>
                      <div style={{color:"#D1D5DB",fontSize:12,lineHeight:1.4}}>{tip}</div>
                    </div>
                  ))}
                </div>
                <div style={{background:`${s.color}08`,borderRadius:6,padding:"8px 10px",border:`1px solid ${s.color}20`,marginTop:4}}>
                  <div style={{color:"#9CA3AF",fontSize:10,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:0.5,marginBottom:4}}>WHY IT MATTERS</div>
                  <div style={{color:"#E5E7EB",fontSize:11,lineHeight:1.5}}>{s.detail}</div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Club Face & Path */}
      <div style={{background:"rgba(255,255,255,0.04)",borderRadius:8,border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden"}}>
        <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{color:GOLD,fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:1,marginBottom:4}}>CLUB FACE & PATH</div>
          <div style={{color:"#D1D5DB",fontSize:11,lineHeight:1.4}}>
            The face angle determines where the ball starts. The path relative to the face determines curve.
          </div>
        </div>

        {/* Visual diagram */}
        <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:8}}>
          <div style={{position:"relative",height:100,background:"rgba(0,0,0,0.3)",borderRadius:8,overflow:"hidden",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            {/* Target line */}
            <div style={{position:"absolute",top:"50%",left:0,right:0,height:1,background:"rgba(255,255,255,0.15)"}}/>
            <div style={{position:"absolute",top:"50%",right:12,transform:"translateY(-50%)",color:"#9CA3AF",fontSize:8,fontFamily:"'IBM Plex Mono',monospace"}}>TARGET</div>
            {/* Club face representation */}
            <div style={{width:40,height:6,background:GOLD,borderRadius:2,position:"relative"}}>
              <div style={{position:"absolute",top:-14,left:"50%",transform:"translateX(-50%)",color:GOLD,fontSize:8,fontFamily:"'IBM Plex Mono',monospace",whiteSpace:"nowrap"}}>FACE</div>
              <div style={{position:"absolute",bottom:-14,left:"50%",transform:"translateX(-50%)",color:"#9CA3AF",fontSize:7,fontFamily:"'IBM Plex Mono',monospace",whiteSpace:"nowrap"}}>LEADING EDGE</div>
            </div>
            {/* Path arrow */}
            <div style={{position:"absolute",top:"30%",left:"20%",width:"60%",height:1,background:"#60A5FA80",transform:"rotate(-5deg)"}}>
              <div style={{position:"absolute",right:-2,top:-4,color:"#60A5FA",fontSize:10}}>→</div>
            </div>
            <div style={{position:"absolute",top:"22%",left:"22%",color:"#60A5FA",fontSize:8,fontFamily:"'IBM Plex Mono',monospace"}}>PATH</div>
          </div>

          {/* Combination results */}
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {facePathInfo.items.map((item,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"6px 10px",borderRadius:5,background:"rgba(0,0,0,0.2)"}}>
                <div style={{color:"#D1D5DB",fontSize:10,fontFamily:"'IBM Plex Mono',monospace"}}>{item.label}</div>
                <div style={{color:item.color,fontSize:10,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace"}}>{item.result}</div>
              </div>
            ))}
          </div>

          {/* Principles */}
          <div style={{marginTop:4}}>
            <div style={{color:"#93C5FD",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,letterSpacing:1,marginBottom:6}}>KEY PRINCIPLES</div>
            {facePathInfo.principles.map((p,i)=>(
              <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:5}}>
                <div style={{width:4,height:4,borderRadius:"50%",background:GOLD,marginTop:5,flexShrink:0}}/>
                <div style={{color:"#D1D5DB",fontSize:11,lineHeight:1.4}}>{p}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WindArrow({dir,mph}: {dir:string;mph:number}){
  const a: Record<string,number>={N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315};
  const angle=a[dir]||0;
  return(
    <div style={{position:"relative",width:48,height:48}}>
      <div style={{width:48,height:48,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.2)",background:"rgba(0,0,0,0.4)",
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{width:4,height:18,background:"#F87171",borderRadius:2,
          transform:`rotate(${angle}deg)`,transformOrigin:"50% 100%",marginBottom:4}}/>
      </div>
      <div style={{position:"absolute",bottom:-2,right:-2,background:GOLD,borderRadius:3,padding:"1px 4px",
        color:"#000",fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:8}}>{mph}</div>
    </div>
  );
}

// ── SCORECARD ────────────────────────────────────────────────────────────────
function ScorecardPanel(){
  const {state,dispatch}=useGame();
  const players = usePlayers();
  const course=state.course;
  const par=course.holes.reduce((s,h)=>s+h.par,0);
  const [matchPlay,setMatchPlay]=useState(false);

  const totals = players.map(pk =>
    Object.values(state.scores[pk] || {}).reduce((s,h)=>s+(h.strokes||0),0)
  );

  const upd=(pl: PlayerKey,hn: number,delta: number)=>{
    const cur=state.scores[pl]?.[hn]?.strokes||0;
    dispatch({type:"SCORE",pl,hn,f:"strokes",v:Math.max(0,cur+delta)});
  };

  const nameOf = (pk: PlayerKey) => state.round?.players[PLAYER_KEYS.indexOf(pk)] || pk.toUpperCase();

  // Match play calculations (works for 2+ players, compares each pair against p1)
  const matchStatus = (() => {
    if(players.length < 2) return null;
    const results: {winner:PlayerKey|"halved";holeNum:number}[] = [];
    let cumulativeScore = 0; // positive = p1 leads, negative = p2 leads
    const holesRemaining = course.holes.length;

    for(const hole of course.holes){
      const s1 = state.scores[players[0]]?.[hole.number]?.strokes;
      const s2 = state.scores[players[1]]?.[hole.number]?.strokes;
      if(!s1 || !s2){ results.push({winner:"halved",holeNum:hole.number}); continue; }
      if(s1 < s2){ cumulativeScore++; results.push({winner:players[0],holeNum:hole.number}); }
      else if(s2 < s1){ cumulativeScore--; results.push({winner:players[1],holeNum:hole.number}); }
      else { results.push({winner:"halved",holeNum:hole.number}); }
    }

    const holesPlayed = results.filter(r=>r.winner!=="halved" || (state.scores[players[0]]?.[r.holeNum]?.strokes && state.scores[players[1]]?.[r.holeNum]?.strokes)).length;
    const holesLeft = holesRemaining - holesPlayed;
    const leader = cumulativeScore > 0 ? players[0] : cumulativeScore < 0 ? players[1] : null;
    const margin = Math.abs(cumulativeScore);
    const dormie = margin === holesLeft && holesLeft > 0;
    const closed = margin > holesLeft;

    let statusText = "All Square";
    if(leader){
      const n = nameOf(leader);
      if(closed) statusText = `${n} wins ${margin}&${holesLeft}`;
      else if(dormie) statusText = `${n} ${margin} UP (Dormie)`;
      else statusText = `${n} ${margin} UP`;
    }

    return { results, cumulativeScore, leader, margin, statusText, dormie, closed };
  })();

  const cols = `48px 36px ${players.map(()=>"1fr").join(" ")}`;

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Mode toggle */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",
        background:"#0A1628",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        <div style={{display:"flex",background:"rgba(255,255,255,0.06)",borderRadius:6,overflow:"hidden"}}>
          <button onClick={()=>setMatchPlay(false)}
            style={{padding:"5px 12px",border:"none",cursor:"pointer",fontSize:10,fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,letterSpacing:0.5,
              background:!matchPlay?NAVY:"transparent",color:!matchPlay?"#fff":"#6B7280"}}>STROKE</button>
          <button onClick={()=>setMatchPlay(true)}
            style={{padding:"5px 12px",border:"none",cursor:"pointer",fontSize:10,fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,letterSpacing:0.5,
              background:matchPlay?NAVY:"transparent",color:matchPlay?"#fff":"#6B7280"}}>MATCH PLAY</button>
        </div>
        {matchPlay && matchStatus && (
          <div style={{color:matchStatus.leader?PLAYER_COLORS[matchStatus.leader]:GOLD,
            fontFamily:"'IBM Plex Mono',monospace",fontSize:10,fontWeight:700}}>
            {matchStatus.statusText}
          </div>
        )}
      </div>

      {/* Match play banner */}
      {matchPlay && matchStatus && (
        <div style={{background:`linear-gradient(135deg,${NAVY}ee,#0F2444)`,padding:"10px 14px",
          borderBottom:`1px solid ${GOLD}30`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:PLAYER_COLORS[players[0]]}}/>
              <span style={{color:PLAYER_COLORS[players[0]],fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:700}}>
                {nameOf(players[0])}
              </span>
            </div>
            <span style={{color:"#6B7280",fontSize:10}}>vs</span>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:PLAYER_COLORS[players[1]]}}/>
              <span style={{color:PLAYER_COLORS[players[1]],fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:700}}>
                {nameOf(players[1])}
              </span>
            </div>
          </div>
          <div style={{background:`${GOLD}20`,border:`1px solid ${GOLD}60`,borderRadius:6,padding:"4px 10px",
            fontFamily:"'IBM Plex Mono',monospace",fontSize:12,fontWeight:700,
            color:matchStatus.leader?PLAYER_COLORS[matchStatus.leader]:GOLD}}>
            {matchStatus.margin === 0 ? "AS" : `${matchStatus.margin} UP`}
          </div>
        </div>
      )}

      {/* Match play hole-by-hole results */}
      {matchPlay && matchStatus && (
        <div style={{display:"flex",gap:2,padding:"8px 10px",flexWrap:"wrap",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          {matchStatus.results.map((r,i)=>{
            const s1 = state.scores[players[0]][r.holeNum]?.strokes;
            const s2 = state.scores[players[1]][r.holeNum]?.strokes;
            const played = s1 && s2;
            const bg = !played ? "rgba(255,255,255,0.04)" :
              r.winner === players[0] ? `${PLAYER_COLORS[players[0]]}30` :
              r.winner === players[1] ? `${PLAYER_COLORS[players[1]]}30` : "rgba(255,255,255,0.08)";
            const border = !played ? "rgba(255,255,255,0.08)" :
              r.winner === players[0] ? PLAYER_COLORS[players[0]] :
              r.winner === players[1] ? PLAYER_COLORS[players[1]] : "rgba(255,255,255,0.2)";
            return(
              <div key={i} style={{width:26,height:26,borderRadius:5,background:bg,border:`1px solid ${border}`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:700,
                color:!played?"#4B5563": r.winner==="halved"?"#9CA3AF":PLAYER_COLORS[r.winner as PlayerKey]}}>
                {!played?"—":r.winner==="halved"?"½":r.winner===players[0]?"W":"L"}
              </div>
            );
          })}
        </div>
      )}

      {/* Standard scorecard grid */}
      <div style={{display:"grid",gridTemplateColumns:cols,background:"#0F2444",padding:"7px 10px",
        borderRadius:matchPlay?"0":"8px 8px 0 0",borderBottom:"1px solid rgba(255,255,255,0.1)",gap:4}}>
        {["HOLE","PAR",...players.map(nameOf)].map((h,i)=>(
          <div key={i} style={{color:i>=2?PLAYER_COLORS[players[i-2]]:"#93C5FD",
            fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:700,
            letterSpacing:1,textAlign:i>1?"center":"left",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h}</div>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto"}}>
        {course.holes.map((hole,idx)=>{
          const cur=state.currentHole===hole.number;
          return(
            <div key={hole.number} onClick={()=>dispatch({type:"SET_HOLE",n:hole.number})}
              style={{display:"grid",gridTemplateColumns:cols,padding:"9px 10px",gap:4,
                alignItems:"center",cursor:"pointer",
                background:cur?"rgba(27,58,107,0.4)":idx%2===0?"rgba(255,255,255,0.025)":"transparent",
                borderLeft:cur?`3px solid ${GOLD}`:"3px solid transparent",
                borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
              <div style={{fontFamily:"'IBM Plex Mono',monospace",color:cur?GOLD:"#fff",fontWeight:cur?700:400,fontSize:13}}>{hole.number}</div>
              <div style={{fontFamily:"'IBM Plex Mono',monospace",color:"#9CA3AF",fontSize:12}}>{hole.par}</div>
              {players.map(pk=>{
                const strokes=state.scores[pk]?.[hole.number]?.strokes;
                return(
                  <ScoreCell key={pk} strokes={strokes} par={hole.par}
                    color={PLAYER_COLORS[pk]}
                    onI={()=>upd(pk,hole.number,1)}
                    onD={()=>upd(pk,hole.number,-1)}/>
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={{display:"grid",gridTemplateColumns:cols,background:"#0F2444",padding:"9px 10px",gap:4,
        borderRadius:"0 0 8px 8px",borderTop:`2px solid ${GOLD}55`}}>
        <div style={{color:GOLD,fontFamily:"'IBM Plex Mono',monospace",fontSize:10,fontWeight:700,letterSpacing:1,gridColumn:"1/3"}}>TOTAL</div>
        <div/>
        {players.map((pk,i)=>{
          const t=totals[i],d=t-par;
          const c=d<0?"#4CAF50":d>0?"#F87171":"#fff";
          return <div key={pk} style={{textAlign:"center",fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:15,color:c}}>
            {t>0?t:"—"}{t>0&&d!==0&&<span style={{fontSize:10,marginLeft:3}}>({d>0?"+":""}{d})</span>}
          </div>;
        })}
      </div>
    </div>
  );
}

function ScoreCell({strokes,par,color,onI,onD}: {strokes:number|undefined;par:number;color:string;onI:()=>void;onD:()=>void}){
  const info=strokes&&strokes>0?getScoreName(strokes,par):null;
  const btn: React.CSSProperties={width:22,height:22,borderRadius:4,border:"none",background:"rgba(255,255,255,0.1)",
    color:"#fff",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0};
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
      <button style={btn} onClick={e=>{e.stopPropagation();onD();}}>−</button>
      <div style={{minWidth:26,textAlign:"center",fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:14,
        color:info?.c||color+"80"}}>
        {strokes&&strokes>0?strokes:"—"}
      </div>
      <button style={btn} onClick={e=>{e.stopPropagation();onI();}}>+</button>
    </div>
  );
}

// ── STATS PANEL ──────────────────────────────────────────────────────────────
function StatsPanel(){
  const {state}=useGame();
  const players = usePlayers();
  const course=state.course;
  const holesPlayed=Object.keys(state.scores.p1).length;

  const avgDist=(shots: ShotRecord[])=>{
    const dists=shots.filter(s=>s.dist>0).map(s=>s.dist);
    return dists.length?Math.round(dists.reduce((a,b)=>a+b,0)/dists.length):0;
  };
  const maxDist=(shots: ShotRecord[])=>shots.length?Math.max(...shots.map(s=>s.dist||0)):0;
  const nameOf = (pk: PlayerKey) => state.round?.players[PLAYER_KEYS.indexOf(pk)] || pk.toUpperCase();

  return(
    <div style={{display:"flex",flexDirection:"column",gap:10,overflowY:"auto"}}>
      <div style={{color:"#93C5FD",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:1}}>
        ROUND STATS — HOLES {holesPlayed}/{course.holes.length}
      </div>

      {players.map(pk=>{
        const shots=Object.values(state.shots[pk]).flat();
        const col=PLAYER_COLORS[pk];
        return(
          <div key={pk} style={{background:"rgba(255,255,255,0.04)",borderRadius:8,padding:"10px 12px",borderLeft:`3px solid ${col}`}}>
            <div style={{color:col,fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:700,marginBottom:8}}>{nameOf(pk)}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {([
                ["Total Shots",shots.length],
                ["Avg Distance",avgDist(shots)>0?`${avgDist(shots)}y`:"—"],
                ["Longest Shot",maxDist(shots)>0?`${maxDist(shots)}y`:"—"],
                ["Holes Played",Object.keys(state.scores[pk] || {}).filter(h=>(state.scores[pk] || {})[+h]?.strokes>0).length],
              ] as [string, string|number][]).map(([label,val])=>(
                <div key={label} style={{background:"rgba(0,0,0,0.2)",borderRadius:5,padding:"7px 10px"}}>
                  <div style={{color:"#9CA3AF",fontSize:9,fontFamily:"'IBM Plex Mono',monospace",marginBottom:3}}>{label}</div>
                  <div style={{color:"#fff",fontSize:18,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace"}}>{val||"—"}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div>
        <div style={{color:"#93C5FD",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,letterSpacing:1,marginBottom:8}}>SCORE VS PAR</div>
        {course.holes.map(hole=>{
          const scores = players.map(pk => state.scores[pk]?.[hole.number]?.strokes);
          const maxScore = Math.max(...scores.map(s=>s||0), hole.par+2);
          return(
            <div key={hole.number} style={{marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",color:"#9CA3AF",fontSize:9,fontFamily:"'IBM Plex Mono',monospace",marginBottom:3}}>
                <span>Hole {hole.number} (Par {hole.par})</span>
                <span>{players.map((pk,i)=>scores[i]?`${nameOf(pk).slice(0,3)}:${scores[i]}`:"").filter(Boolean).join(" · ")}</span>
              </div>
              <div style={{height:6,background:"rgba(255,255,255,0.06)",borderRadius:3,position:"relative"}}>
                <div style={{position:"absolute",left:`${(hole.par/maxScore)*100}%`,top:0,width:1,height:"100%",background:GOLD,opacity:0.6}}/>
                {players.map((pk,i)=>{
                  const s=scores[i];
                  if(!s) return null;
                  const topPct = i/(players.length);
                  const heightPct = 1/players.length;
                  return <div key={pk} style={{
                    position:"absolute",left:0,
                    top:`${topPct*100}%`,
                    height:`${heightPct*100}%`,
                    width:`${(s/maxScore)*100}%`,
                    background:PLAYER_COLORS[pk],borderRadius:3,opacity:0.7
                  }}/>;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

// ── ROUND SCREEN ─────────────────────────────────────────────────────────────
function RoundScreen(){
  const {state,dispatch}=useGame();
  const players = usePlayers();
  const course=state.course;
  const hole=course.holes.find(h=>h.number===state.currentHole)||course.holes[0];
  const PANELS=[{id:"map",l:"Map"},{id:"club",l:"Club"},{id:"gapp",l:"GAPP"},{id:"ar",l:"AR Glasses"},{id:"stats",l:"Stats"},{id:"card",l:"Card"}];

  useEffect(()=>{
    fetchCourses().then(list=>{
      const fresh=list.find(c=>c.slug===course.slug);
      if(fresh && fresh.holes.length>course.holes.length){
        dispatch({type:"SET_COURSE",course:fresh});
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const [shotFlash, setShotFlash]=useState(false);
  const shotFlashTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

  const nameOf = (pk: PlayerKey) => state.round?.players[PLAYER_KEYS.indexOf(pk)] || pk.toUpperCase();

  const handleHubShot=useCallback((shot: ShotDetectedPayload)=>{
    const ballToPlayer: Record<string,PlayerKey> = {ball1:"p1",ball2:"p2",ball3:"p3",ball4:"p4"};
    const targetPlayer = (shot.ballId && ballToPlayer[shot.ballId]) ? ballToPlayer[shot.ballId] : state.activePlayer;
    const shotIndex = (state.shots[targetPlayer][state.currentHole]?.length || 0) + 1;
    dispatch({
      type:"ADD_SHOT",
      pl: targetPlayer,
      hn: state.currentHole,
      sh: { x: shot.x, y: shot.y, dist: shot.distance, ts: shot.ts },
    });
    dispatch({ type:"SCORE", pl: targetPlayer, hn: state.currentHole, f:"strokes",
      v: (state.scores[targetPlayer]?.[state.currentHole]?.strokes||0)+1 });

    // Persist auto-detected shot to Supabase for analytics
    if(state.roundId){
      recordShot({
        round_id: state.roundId,
        ball_id: shot.ballId || "",
        player_key: targetPlayer,
        hole: state.currentHole,
        shot_index: shotIndex,
        x: shot.x, y: shot.y,
        distance_yards: shot.distance,
        gps_lat: shot.gps?.lat ?? null,
        gps_lng: shot.gps?.lng ?? null,
        cart_lat: shot.cart?.lat ?? null,
        cart_lng: shot.cart?.lng ?? null,
        cart_heading_deg: shot.cart?.headingDeg ?? null,
      });
    }

    setShotFlash(true);
    if(shotFlashTimer.current) clearTimeout(shotFlashTimer.current);
    shotFlashTimer.current=setTimeout(()=>setShotFlash(false), 1400);
  },[dispatch, state.activePlayer, state.currentHole, state.scores, state.shots, state.roundId]);

  const { status: hubStatus, latency, ballPositions, cart }=useHubSocket({
    activePlayer: state.activePlayer,
    currentHole:  state.currentHole,
    onShot:       handleHubShot,
  });

  // Auto-calculate distance from active player's UWB ball to the pin.
  // Hole coords are normalized [0,1]; multiply the magnitude by hole.yards
  // to convert to real yards along the hole's tee→pin axis.
  const autoDistanceToPin: number | null = (()=>{
    if(!ballPositions) return null;
    const ballToPlayer: Record<string,PlayerKey> = {ball1:"p1",ball2:"p2",ball3:"p3",ball4:"p4"};
    const ballId = (Object.keys(ballToPlayer) as Array<keyof typeof ballToPlayer>)
      .find(b => ballToPlayer[b] === state.activePlayer);
    const bp = ballId ? ballPositions[ballId] : undefined;
    if(!bp) return null;
    const dx = (hole.pin.x - bp.x);
    const dy = (hole.pin.y - bp.y);
    const norm = Math.sqrt(dx*dx + dy*dy);
    const teeDx = hole.pin.x - hole.tee.x;
    const teeDy = hole.pin.y - hole.tee.y;
    const teeNorm = Math.sqrt(teeDx*teeDx + teeDy*teeDy) || 1;
    return Math.round((norm / teeNorm) * hole.yards);
  })();

  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:"#050E1A"}}>
      {/* Topbar */}
      <div style={{background:"#0A1628",borderBottom:"1px solid rgba(255,255,255,0.08)",padding:"8px 14px",
        display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:GOLD,fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:16,letterSpacing:1}}>⛳ VF</span>
          <HubStatusDot status={hubStatus} latency={latency} shotFlash={shotFlash}/>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>dispatch({type:"SET_HOLE",n:Math.max(1,state.currentHole-1)})}
            disabled={state.currentHole===1}
            style={{width:32,height:32,borderRadius:6,border:"none",background:"rgba(255,255,255,0.08)",
              color:state.currentHole===1?"#374151":"#fff",cursor:state.currentHole===1?"not-allowed":"pointer",fontSize:12}}>◀</button>
          <div style={{textAlign:"center",minWidth:90}}>
            <div style={{color:GOLD,fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:13,letterSpacing:1}}>HOLE {hole.number}</div>
            <div style={{color:"#9CA3AF",fontSize:10,fontFamily:"'IBM Plex Mono',monospace"}}>PAR {hole.par}  •  {hole.yards}Y</div>
          </div>
          <button onClick={()=>state.currentHole<course.holes.length?dispatch({type:"SET_HOLE",n:state.currentHole+1}):dispatch({type:"END"})}
            style={{width:32,height:32,borderRadius:6,border:"none",background:state.currentHole===course.holes.length?GREEN:"rgba(255,255,255,0.08)",
              color:"#fff",cursor:"pointer",fontSize:state.currentHole===course.holes.length?10:12,fontFamily:"'IBM Plex Mono',monospace"}}>
            {state.currentHole===course.holes.length?"END":"▶"}
          </button>
        </div>

        {/* Player selector */}
        <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
          {players.map(pk=>(
            <button key={pk} onClick={()=>dispatch({type:"SET_PLAYER",p:pk})}
              style={{padding:"4px 8px",borderRadius:5,border:"none",cursor:"pointer",fontSize:10,fontFamily:"'IBM Plex Mono',monospace",
                background:state.activePlayer===pk?`${PLAYER_COLORS[pk]}25`:"rgba(255,255,255,0.06)",
                color:state.activePlayer===pk?PLAYER_COLORS[pk]:"#9CA3AF",
                outline:state.activePlayer===pk?`1px solid ${PLAYER_COLORS[pk]}60`:"none",
                maxWidth:64,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {nameOf(pk)}
            </button>
          ))}
          <button onClick={()=>dispatch({type:"UNDO",pl:state.activePlayer,hn:hole.number})}
            style={{padding:"4px 8px",borderRadius:5,border:"none",background:"rgba(239,68,68,0.15)",
              color:"#F87171",cursor:"pointer",fontSize:10,fontFamily:"'IBM Plex Mono',monospace"}}>↩</button>
        </div>
      </div>

      {/* Panel tabs */}
      <div style={{display:"flex",background:"#0A1628",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
        {PANELS.map(p=>(
          <button key={p.id} onClick={()=>dispatch({type:"SET_PANEL",p:p.id})}
            style={{flex:1,padding:"10px 4px",border:"none",cursor:"pointer",fontSize:12,fontFamily:"'Rajdhani',sans-serif",fontWeight:600,letterSpacing:0.5,
              background:"transparent",color:state.panel===p.id?"#fff":"#6B7280",
              borderBottom:state.panel===p.id?`2px solid ${GOLD}`:"2px solid transparent",
              transition:"all 0.15s"}}>
            {p.l}
          </button>
        ))}
      </div>

      {/* Active panel */}
      <div style={{flex:1,padding:12,overflowY:"auto"}}>
        {state.panel==="map"  &&<ShotMap hole={hole} ballPositions={ballPositions} cart={cart}/>}
        {state.panel==="club" &&<ClubPanel hole={hole} autoYards={autoDistanceToPin}/>}
        {state.panel==="gapp" &&<GAPPPanel/>}
        {state.panel==="ar"   &&<GlassesPanel
          roundId={state.roundId}
          hole={hole}
          windMph={state.wind.mph}
          windDir={state.wind.dir}
          recommendedClub={recommendClub(autoDistanceToPin ?? hole.yards) || undefined}
          distanceToPin={autoDistanceToPin ?? hole.yards}
        />}
        {state.panel==="stats"&&<StatsPanel/>}
        {state.panel==="card" &&<ScorecardPanel/>}
      </div>

      {state.panel==="map" && <HubStatusBar status={hubStatus}/>}
    </div>
  );
}

// ── REVIEW SCREEN ─────────────────────────────────────────────────────────────
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
          roundId: state.round?.id || null,
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
      } else {
        const body = await res.json().catch(()=>({error:"Unknown error"}));
        setEmailError(body.error || "Failed to send");
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
            disabled={emailStatus==="sending"||emailStatus==="sent"}
            style={{padding:"9px 16px",borderRadius:8,border:"none",cursor:emailStatus==="sending"||emailStatus==="sent"?"default":"pointer",
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

// ── HISTORY SCREEN ───────────────────────────────────────────────────────────
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

// ── PROFILE / STATS SCREEN ───────────────────────────────────────────────────
function ProfileScreen(){
  const {dispatch}=useGame();
  const auth=useAuth();
  const [rounds,setRounds]=useState<RoundRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<"overview"|"handicap"|"courses">("overview");

  useEffect(()=>{
    fetchCompletedRounds().then(r=>{setRounds(r);setLoading(false);});
  },[]);

  // Extract round data for analysis
  type RoundData = {total:number;par:number;diff:number;date:string;courseName:string;courseSlug:string;holes:{number:number;par:number;strokes:number;shots:ShotRecord[]}[]};
  const roundsData: RoundData[] = rounds.map(r=>{
    const st=r.state as Record<string,unknown>;
    const scores=st.scores as Record<string,Record<string,{strokes:number;putts:number}>>|undefined;
    const shots=st.shots as Record<string,Record<string,ShotRecord[]>>|undefined;
    const course=st.course as Course|undefined;
    if(!scores || !course) return null;
    const par=course.holes.reduce((s,h)=>s+h.par,0);
    const p1Scores=scores.p1;
    if(!p1Scores) return null;
    const total=Object.values(p1Scores).reduce((s,h)=>s+(h.strokes||0),0);
    if(total===0) return null;
    const holes=course.holes.map(h=>({
      number:h.number,par:h.par,
      strokes:p1Scores[String(h.number)]?.strokes||0,
      shots:(shots?.p1?.[String(h.number)]||[]) as ShotRecord[],
    }));
    return{total,par,diff:total-par,date:r.ended_at||r.started_at,courseName:r.course_name,courseSlug:r.course_slug,holes};
  }).filter((d): d is RoundData => d!==null);

  // Handicap calculation (simplified USGA: best 8 of last 20 differentials, x 0.96)
  const calcHandicap=()=>{
    if(roundsData.length<5) return null;
    const recent=roundsData.slice(0,20);
    const diffs=recent.map(r=>{
      const slopeRating=113; // default slope
      const courseRating=r.par; // simplified: use par as course rating
      return (r.total - courseRating) * (113 / slopeRating);
    });
    diffs.sort((a,b)=>a-b);
    const count=recent.length;
    const take=count<=6?1:count<=8?2:count<=10?3:count<=12?4:count<=14?5:count<=16?6:count<=18?7:8;
    const best=diffs.slice(0,take);
    const avg=best.reduce((s,d)=>s+d,0)/best.length;
    return Math.round(avg*0.96*10)/10;
  };
  const handicap=calcHandicap();

  // Scoring distribution
  const scoringDist=()=>{
    let eagles=0,birdies=0,pars=0,bogeys=0,doubles=0,worse=0;
    roundsData.forEach(r=>r.holes.forEach(h=>{
      if(h.strokes===0) return;
      const d=h.strokes-h.par;
      if(d<=-2) eagles++;
      else if(d===-1) birdies++;
      else if(d===0) pars++;
      else if(d===1) bogeys++;
      else if(d===2) doubles++;
      else worse++;
    }));
    return{eagles,birdies,pars,bogeys,doubles,worse};
  };
  const dist=scoringDist();
  const distTotal=dist.eagles+dist.birdies+dist.pars+dist.bogeys+dist.doubles+dist.worse;

  // Par performance
  const parPerformance=()=>{
    const byPar:{[key:number]:{count:number;totalDiff:number;avgScore:number}} = {};
    roundsData.forEach(r=>r.holes.forEach(h=>{
      if(h.strokes===0) return;
      if(!byPar[h.par]) byPar[h.par]={count:0,totalDiff:0,avgScore:0};
      byPar[h.par].count++;
      byPar[h.par].totalDiff+=h.strokes-h.par;
      byPar[h.par].avgScore+=h.strokes;
    }));
    return Object.entries(byPar).map(([par,data])=>({
      par:+par,count:data.count,
      avgDiff:Math.round(data.totalDiff/data.count*10)/10,
      avgScore:Math.round(data.avgScore/data.count*10)/10,
    })).sort((a,b)=>a.par-b.par);
  };

  // Streak & achievements
  const achievements=()=>{
    const results:string[]=[];
    if(roundsData.length>=1) results.push("First Round");
    if(roundsData.length>=5) results.push("5 Rounds");
    if(roundsData.length>=10) results.push("10 Rounds");
    if(roundsData.length>=25) results.push("25 Rounds");
    if(dist.eagles>0) results.push("First Eagle");
    if(dist.birdies>=10) results.push("10 Birdies");
    if(dist.birdies>=50) results.push("50 Birdies");
    const subPar=roundsData.filter(r=>r.diff<0);
    if(subPar.length>0) results.push("Under Par");
    if(subPar.length>=5) results.push("5x Under Par");
    const lowRound=roundsData.reduce((best,r)=>r.diff<best?r.diff:best, Infinity);
    if(lowRound<=0) results.push(`Low: ${lowRound>=0?"Even":`${lowRound}`}`);
    return results;
  };

  // Course breakdown
  const courseBreakdown=()=>{
    const map:Record<string,{name:string;rounds:number;bestScore:number;bestDiff:number;avgScore:number;avgDiff:number}> = {};
    roundsData.forEach(r=>{
      if(!map[r.courseSlug]) map[r.courseSlug]={name:r.courseName,rounds:0,bestScore:Infinity,bestDiff:Infinity,avgScore:0,avgDiff:0};
      const entry=map[r.courseSlug];
      entry.rounds++;
      entry.avgScore+=r.total;
      entry.avgDiff+=r.diff;
      if(r.total<entry.bestScore){ entry.bestScore=r.total; entry.bestDiff=r.diff; }
    });
    return Object.values(map).map(e=>({...e,avgScore:Math.round(e.avgScore/e.rounds),avgDiff:Math.round(e.avgDiff/e.rounds*10)/10}));
  };

  const now=new Date();
  const weekStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime() - (now.getDay()*86400000);
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1).getTime();
  const weeklyRounds=roundsData.filter(r=>new Date(r.date).getTime()>=weekStart);
  const monthlyRounds=roundsData.filter(r=>new Date(r.date).getTime()>=monthStart);

  const avgOf=(list:RoundData[])=>list.length?Math.round(list.reduce((s,r)=>s+r.total,0)/list.length):null;
  const diffOf=(list:RoundData[])=>list.length?Math.round(list.reduce((s,r)=>s+r.diff,0)/list.length*10)/10:null;

  const tabBtn = (id:"overview"|"handicap"|"courses",label:string) => (
    <button onClick={()=>setTab(id)}
      style={{flex:1,padding:"9px 8px",border:"none",cursor:"pointer",fontSize:11,
        fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,letterSpacing:0.5,
        background:tab===id?NAVY:"transparent",color:tab===id?"#fff":"#6B7280",
        borderBottom:tab===id?`2px solid ${GOLD}`:"2px solid transparent",transition:"all 0.15s"}}>
      {label}
    </button>
  );

  return(
    <div style={{minHeight:"100vh",background:"radial-gradient(ellipse at 30% 20%, #0F2444 0%, #050E1A 60%)",
      padding:16,display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <button onClick={()=>dispatch({type:"SET_VIEW",v:"home"})}
          style={{padding:"8px 12px",borderRadius:6,border:"none",background:"rgba(255,255,255,0.08)",
            color:"#fff",cursor:"pointer",fontSize:12,fontFamily:"'IBM Plex Mono',monospace"}}>← Home</button>
        <div style={{flex:1}}>
          <div style={{color:"#fff",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:22}}>My Stats</div>
          <div style={{color:"#9CA3AF",fontSize:11,fontFamily:"'IBM Plex Mono',monospace"}}>{auth.user?.email}</div>
        </div>
        <button onClick={()=>auth.signOut()}
          style={{padding:"7px 12px",borderRadius:6,border:"1px solid rgba(248,113,113,0.3)",background:"rgba(248,113,113,0.08)",
            color:"#F87171",cursor:"pointer",fontSize:11,fontFamily:"'IBM Plex Mono',monospace"}}>Sign Out</button>
      </div>

      {loading ? (
        <div style={{textAlign:"center",padding:40,color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:12}}>Loading stats...</div>
      ):(
        <>
          {/* Handicap hero card */}
          <div style={{background:`linear-gradient(135deg,${NAVY} 0%,#0F2444 100%)`,borderRadius:14,padding:"20px 20px",
            border:`1px solid ${GOLD}30`,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-20,right:-20,width:100,height:100,borderRadius:"50%",
              background:`radial-gradient(circle,${GOLD}08,transparent 70%)`}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{color:GOLD,fontFamily:"'IBM Plex Mono',monospace",fontSize:9,letterSpacing:2,marginBottom:6}}>HANDICAP INDEX</div>
                <div style={{color:"#fff",fontSize:48,fontWeight:700,fontFamily:"'Rajdhani',sans-serif",lineHeight:1}}>
                  {handicap!==null?handicap.toFixed(1):"—"}
                </div>
                {handicap===null && (
                  <div style={{color:"#6B7280",fontSize:10,fontFamily:"'IBM Plex Mono',monospace",marginTop:4}}>
                    Need {Math.max(0,5-roundsData.length)} more round{5-roundsData.length!==1?"s":""} to calculate
                  </div>
                )}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,marginBottom:4}}>ROUNDS</div>
                <div style={{color:"#fff",fontSize:24,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>{roundsData.length}</div>
              </div>
            </div>
            {roundsData.length>0 && (
              <div style={{display:"flex",gap:16,marginTop:14,paddingTop:14,borderTop:`1px solid ${GOLD}15`}}>
                <div>
                  <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:9}}>AVG SCORE</div>
                  <div style={{color:"#fff",fontSize:16,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace"}}>{avgOf(roundsData)}</div>
                </div>
                <div>
                  <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:9}}>AVG VS PAR</div>
                  <div style={{color:diffOf(roundsData)!==null&&diffOf(roundsData)!<0?"#4CAF50":"#F87171",
                    fontSize:16,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace"}}>
                    {diffOf(roundsData)!==null?`${diffOf(roundsData)!>0?"+":""}${diffOf(roundsData)}`:"—"}
                  </div>
                </div>
                <div>
                  <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:9}}>BEST</div>
                  <div style={{color:"#4CAF50",fontSize:16,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace"}}>
                    {Math.min(...roundsData.map(r=>r.total))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tab navigation */}
          <div style={{display:"flex",background:"rgba(255,255,255,0.03)",borderRadius:8,overflow:"hidden",
            border:"1px solid rgba(255,255,255,0.06)"}}>
            {tabBtn("overview","OVERVIEW")}
            {tabBtn("handicap","HANDICAP")}
            {tabBtn("courses","COURSES")}
          </div>

          {tab==="overview" && (
            <>
              {/* Period stats */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[
                  {label:"This Week",count:weeklyRounds.length,avg:avgOf(weeklyRounds)},
                  {label:"This Month",count:monthlyRounds.length,avg:avgOf(monthlyRounds)},
                  {label:"All Time",count:roundsData.length,avg:avgOf(roundsData)},
                ].map(({label,count,avg})=>(
                  <div key={label} style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"12px 10px",
                    border:"1px solid rgba(255,255,255,0.06)",textAlign:"center"}}>
                    <div style={{color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:8,fontWeight:700,letterSpacing:1,marginBottom:4}}>{label.toUpperCase()}</div>
                    <div style={{color:"#fff",fontSize:20,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>{avg||"—"}</div>
                    <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:9}}>{count} rd{count!==1?"s":""}</div>
                  </div>
                ))}
              </div>

              {/* Scoring distribution */}
              {distTotal>0 && (
                <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"14px 16px",
                  border:"1px solid rgba(255,255,255,0.06)"}}>
                  <div style={{color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:1,marginBottom:10}}>SCORING DISTRIBUTION</div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {([
                      {label:"Eagles",count:dist.eagles,color:"#FFD700"},
                      {label:"Birdies",count:dist.birdies,color:"#4CAF50"},
                      {label:"Pars",count:dist.pars,color:"#93C5FD"},
                      {label:"Bogeys",count:dist.bogeys,color:"#FB923C"},
                      {label:"Doubles",count:dist.doubles,color:"#F87171"},
                      {label:"Worse",count:dist.worse,color:"#EF4444"},
                    ] as const).filter(r=>r.count>0).map(row=>(
                      <div key={row.label} style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:56,color:row.color,fontFamily:"'IBM Plex Mono',monospace",fontSize:10,fontWeight:700}}>{row.label}</div>
                        <div style={{flex:1,height:8,background:"rgba(255,255,255,0.06)",borderRadius:4,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${(row.count/distTotal)*100}%`,background:row.color,borderRadius:4,
                            transition:"width 0.3s ease"}}/>
                        </div>
                        <div style={{width:30,textAlign:"right",color:"#D1D5DB",fontFamily:"'IBM Plex Mono',monospace",fontSize:10}}>{row.count}</div>
                        <div style={{width:32,textAlign:"right",color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:9}}>
                          {Math.round(row.count/distTotal*100)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Par performance */}
              {parPerformance().length>0 && (
                <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"14px 16px",
                  border:"1px solid rgba(255,255,255,0.06)"}}>
                  <div style={{color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:1,marginBottom:10}}>PERFORMANCE BY PAR</div>
                  <div style={{display:"grid",gridTemplateColumns:`repeat(${parPerformance().length},1fr)`,gap:8}}>
                    {parPerformance().map(pp=>(
                      <div key={pp.par} style={{textAlign:"center",background:"rgba(0,0,0,0.2)",borderRadius:8,padding:"10px 8px"}}>
                        <div style={{color:GOLD,fontFamily:"'IBM Plex Mono',monospace",fontSize:10,fontWeight:700,marginBottom:6}}>PAR {pp.par}</div>
                        <div style={{color:"#fff",fontSize:20,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>{pp.avgScore}</div>
                        <div style={{color:pp.avgDiff<0?"#4CAF50":pp.avgDiff>0?"#F87171":"#93C5FD",
                          fontFamily:"'IBM Plex Mono',monospace",fontSize:10,marginTop:2}}>
                          {pp.avgDiff===0?"Even":`${pp.avgDiff>0?"+":""}${pp.avgDiff}`}
                        </div>
                        <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:8,marginTop:2}}>{pp.count} holes</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Achievements */}
              {achievements().length>0 && (
                <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"14px 16px",
                  border:"1px solid rgba(255,255,255,0.06)"}}>
                  <div style={{color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:1,marginBottom:10}}>ACHIEVEMENTS</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {achievements().map(a=>(
                      <div key={a} style={{padding:"6px 10px",borderRadius:6,background:`${GOLD}12`,border:`1px solid ${GOLD}40`,
                        color:GOLD,fontFamily:"'IBM Plex Mono',monospace",fontSize:10,fontWeight:600}}>{a}</div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab==="handicap" && (
            <>
              {/* Handicap explanation */}
              <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"14px 16px",
                border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:1,marginBottom:8}}>HOW IT WORKS</div>
                <div style={{color:"#D1D5DB",fontSize:12,lineHeight:1.6}}>
                  Your handicap is calculated from the best differentials of your last 20 rounds, multiplied by 0.96.
                  Lower is better. A scratch golfer has a handicap of 0.
                </div>
              </div>

              {/* Round differentials */}
              <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"14px 16px",
                border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:1,marginBottom:10}}>RECENT DIFFERENTIALS</div>
                {roundsData.length===0 ? (
                  <div style={{color:"#4B5563",fontSize:11,fontFamily:"'IBM Plex Mono',monospace"}}>No rounds yet</div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {roundsData.slice(0,20).map((r,i)=>{
                      const differential=Math.round(r.diff*10)/10;
                      return(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",
                          borderRadius:6,background:i<8&&roundsData.length>=8?"rgba(200,150,12,0.06)":"transparent"}}>
                          <div style={{width:20,color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,textAlign:"center"}}>{i+1}</div>
                          <div style={{flex:1,color:"#D1D5DB",fontSize:11,fontFamily:"'IBM Plex Mono',monospace"}}>{r.courseName}</div>
                          <div style={{color:"#9CA3AF",fontSize:9,fontFamily:"'IBM Plex Mono',monospace"}}>
                            {new Date(r.date).toLocaleDateString(undefined,{month:"short",day:"numeric"})}
                          </div>
                          <div style={{width:40,textAlign:"right",color:"#fff",fontSize:12,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace"}}>{r.total}</div>
                          <div style={{width:36,textAlign:"right",
                            color:differential<0?"#4CAF50":differential>0?"#F87171":"#93C5FD",
                            fontSize:11,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace"}}>
                            {differential>=0?"+":""}{differential}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {roundsData.length>=8 && (
                  <div style={{marginTop:8,color:"#6B7280",fontSize:9,fontFamily:"'IBM Plex Mono',monospace"}}>
                    Highlighted rows are used in handicap calculation (best 8 of 20)
                  </div>
                )}
              </div>

              {/* Trend chart */}
              {roundsData.length>=3 && (
                <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"14px 16px",
                  border:"1px solid rgba(255,255,255,0.06)"}}>
                  <div style={{color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:1,marginBottom:10}}>SCORE TREND</div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:4,height:70}}>
                    {roundsData.slice(0,12).reverse().map((r,i)=>{
                      const barH=Math.max(8,Math.min(62,35+r.diff*4));
                      const col=r.diff<0?"#4CAF50":r.diff>0?"#F87171":"#93C5FD";
                      return(
                        <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                          <div style={{fontSize:8,color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace"}}>
                            {r.diff===0?"E":`${r.diff>0?"+":""}${r.diff}`}
                          </div>
                          <div style={{width:"100%",height:barH,background:col,borderRadius:3,opacity:0.8,
                            transition:"height 0.3s ease"}}/>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{color:"#6B7280",fontSize:9,fontFamily:"'IBM Plex Mono',monospace",marginTop:6,textAlign:"center"}}>
                    Last {Math.min(roundsData.length,12)} rounds (oldest → newest)
                  </div>
                </div>
              )}
            </>
          )}

          {tab==="courses" && (
            <>
              {courseBreakdown().length===0 ? (
                <div style={{textAlign:"center",padding:40,color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:12}}>
                  No course data yet
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {courseBreakdown().sort((a,b)=>b.rounds-a.rounds).map(c=>(
                    <div key={c.name} style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"14px 16px",
                      border:"1px solid rgba(255,255,255,0.06)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                        <div>
                          <div style={{color:"#fff",fontFamily:"'Rajdhani',sans-serif",fontWeight:600,fontSize:16}}>{c.name}</div>
                          <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:10,marginTop:2}}>
                            {c.rounds} round{c.rounds!==1?"s":""} played
                          </div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{color:c.avgDiff<0?"#4CAF50":c.avgDiff>0?"#F87171":"#93C5FD",
                            fontSize:11,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace"}}>
                            Avg: {c.avgDiff===0?"E":`${c.avgDiff>0?"+":""}${c.avgDiff}`}
                          </div>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                        <div style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                          <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:8}}>AVG</div>
                          <div style={{color:"#fff",fontSize:16,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>{c.avgScore}</div>
                        </div>
                        <div style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                          <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:8}}>BEST</div>
                          <div style={{color:"#4CAF50",fontSize:16,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>{c.bestScore}</div>
                        </div>
                        <div style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"8px 10px",textAlign:"center"}}>
                          <div style={{color:"#6B7280",fontFamily:"'IBM Plex Mono',monospace",fontSize:8}}>BEST VS PAR</div>
                          <div style={{color:c.bestDiff<0?"#4CAF50":c.bestDiff>0?"#F87171":"#93C5FD",
                            fontSize:16,fontWeight:700,fontFamily:"'Rajdhani',sans-serif"}}>
                            {c.bestDiff===0?"E":`${c.bestDiff>0?"+":""}${c.bestDiff}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
function PersistenceBridge(){
  const {state}=useGame();
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
    return(
      <div style={{minHeight:"100vh",background:"#050E1A",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{color:"#9CA3AF",fontFamily:"'IBM Plex Mono',monospace",fontSize:12}}>Loading...</div>
      </div>
    );
  }

  if(!auth.user){
    return <AuthScreen/>;
  }

  return(
    <Ctx.Provider value={{state,dispatch}}>
      <style>{CSS}</style>
      <PersistenceBridge/>
      <SpeedInsights />
      <div className="app">
        <button onClick={toggleFullscreen}
          style={{position:"fixed",top:10,right:10,zIndex:9999,
            width:32,height:32,borderRadius:6,border:"1px solid rgba(255,255,255,0.15)",
            background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",
            display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
          {isFullscreen
            ? <Minimize size={14} color="#fff"/>
            : <Maximize size={14} color="#fff"/>}
        </button>
        {state.view==="home"      &&<HomeScreen/>}
        {state.view==="addCourse" &&<AddCourseScreen
          onCancel={()=>dispatch({type:"SET_VIEW",v:"home"})}
          onSaved={(c)=>{ dispatch({type:"SET_COURSE",course:c}); dispatch({type:"SET_VIEW",v:"home"}); }}
        />}
        {state.view==="round"     &&<RoundScreen/>}
        {state.view==="review"    &&<ReviewScreen/>}
        {state.view==="history"   &&<HistoryScreen/>}
        {state.view==="profile"   &&<ProfileScreen/>}
      </div>
    </Ctx.Provider>
  );
}
