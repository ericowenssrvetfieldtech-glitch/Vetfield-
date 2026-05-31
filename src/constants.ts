import type { Course } from "./lib/supabase";

export const NAVY = "#1B3A6B", GREEN = "#2E7D32", GOLD = "#C8960C";

export const PLAYER_KEYS = ["p1", "p2", "p3", "p4"] as const;
export type PlayerKey = typeof PLAYER_KEYS[number];

export const PLAYER_COLORS: Record<PlayerKey, string> = {
  p1: "#60A5FA",
  p2: "#34D399",
  p3: "#FB923C",
  p4: "#F472B6",
};

export const CLUBS = [
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

export const DEFAULT_COURSE: Course = {
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

export function getScoreName(s: number, par: number){
  const d=s-par;
  if(s===1)return{l:"Hole in One!",c:"#FFD700"};
  if(d<=-2) return{l:"Eagle",c:"#FFD700"};
  if(d===-1)return{l:"Birdie",c:"#4CAF50"};
  if(d===0) return{l:"Par",c:"#93C5FD"};
  if(d===1) return{l:"Bogey",c:"#F87171"};
  return{l:`+${d}`,c:"#EF4444"};
}

export function recommendClub(yards: number, wind=0){
  const adj=yards+wind;
  return [...CLUBS].filter(c=>c.abbr!=="PT").sort((a,b)=>Math.abs(a.avg-adj)-Math.abs(b.avg-adj))[0];
}
