import { createContext, useContext } from "react";
import type { Course } from "./lib/supabase";
import { PLAYER_KEYS, DEFAULT_COURSE } from "./constants";
import type { PlayerKey } from "./constants";

export type ShotRecord = {x:number;y:number;dist:number;ts:number};
export type ScoreRecord = {strokes:number;putts:number};

export type State = {
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
export type Action = {type:string;[key:string]:unknown};

const emptyPlayerData = (): Record<PlayerKey, Record<number, never>> =>
  ({ p1:{}, p2:{}, p3:{}, p4:{} });

export const init: State = {
  view:"home", panel:"map", currentHole:1, activePlayer:"p1",
  round:null,
  shots: emptyPlayerData() as Record<PlayerKey, Record<number, ShotRecord[]>>,
  scores: emptyPlayerData() as Record<PlayerKey, Record<number, ScoreRecord>>,
  wind:{mph:8,dir:"SW"}, teeColor:"white",
  course: DEFAULT_COURSE, roundId: null,
};

export function reducer(s: State, a: Action): State {
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

export const GameCtx = createContext<{state:State;dispatch:React.Dispatch<Action>}|null>(null);

export function useGame(){return useContext(GameCtx)!;}

export function usePlayers(): PlayerKey[] {
  const {state} = useGame();
  const n = state.round?.players.length ?? 2;
  return PLAYER_KEYS.slice(0, n);
}
