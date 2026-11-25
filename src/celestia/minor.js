// minor.js — dwarf planets & large asteroids (osculating elements ex Stellarium
// ssystem_minor.ini; comets ex ssystem_1000comets.ini — modern apparitions,
// converted to J2000 mean-longitude + daily-rate form for Kepler solver).
export const MINOR_BODIES = [
 {id:"ceres",name:"Ceres",a:2.7656,e:0.0796,I:10.5879,L:158.8034,lp:153.5494,node:80.2496,da:0,de:0,dI:0,dL:7827.1997,dlp:0,dnode:0,radiusKm:473,color:"#9a938b",tex:'rock',desc:"Dwarf planet; largest belt object; bright salt deposits at Occator."},
 {id:"pallas",name:"Pallas",a:2.7699,e:0.2306,I:34.9283,L:113.7936,lp:123.822,node:172.8886,da:0,de:0,dI:0,dL:7808.9377,dlp:0,dnode:0,radiusKm:256,color:"#8d8578",tex:'rock',desc:"Second asteroid found (1802); highly inclined orbit."},
 {id:"vesta",name:"Vesta",a:2.3615,e:0.0902,I:7.1441,L:234.0485,lp:255.2394,node:103.7023,da:0,de:0,dI:0,dL:9919.7527,dlp:0,dnode:0,radiusKm:263,color:"#7d7468",tex:'rock',desc:"Brightest asteroid; visited by Dawn; basaltic lava surface."},
 {id:"juno",name:"Juno",a:2.771,e:0.2558,I:12.986,L:54.8964,lp:57.7036,node:169.8199,da:0,de:0,dI:0,dL:7804.4569,dlp:0,dnode:0,radiusKm:160,color:"#8d8578",tex:'rock',desc:"Rocky S-type; one of the first asteroids discovered."},
 {id:"hygiea",name:"Hygiea",a:3.2323,e:0.1082,I:3.8329,L:85.0788,lp:235.7275,node:283.1216,da:0,de:0,dI:0,dL:6194.8463,dlp:0,dnode:0,radiusKm:217,color:"#7d7468",tex:'rock',desc:"Large carbonaceous belt object; nearly spherical."},
 {id:"eris",name:"Eris",a:68.1041,e:0.4343,I:43.7779,L:21.4677,lp:186.7817,node:36.0637,da:0,de:0,dI:0,dL:64.0523,dlp:0,dnode:0,radiusKm:1163,color:"#cfd4d8",tex:'rock',desc:"Most massive dwarf planet; reason Pluto was reclassified."},
 {id:"haumea",name:"Haumea",a:2.4269,e:0.1983,I:28.2085,L:23.0545,lp:2.8618,node:121.8659,da:0,de:0,dI:0,dL:9521.7452,dlp:0,dnode:0,radiusKm:780,color:"#d8dce0",tex:'rock',desc:"Fast-spinning egg-shaped Kuiper world with a ring."},
 {id:"makemake",name:"Makemake",a:45.3842,e:0.1635,I:29.0337,L:155.239,lp:16.0161,node:79.2607,da:0,de:0,dI:0,dL:117.7436,dlp:0,dnode:0,radiusKm:715,color:"#b08a5a",tex:'rock',desc:"Bright methane-ice dwarf; no confirmed atmosphere."},
 {id:"orcus",name:"Orcus",a:39.237,e:0.2248,I:20.5565,L:132.283,lp:342.2283,node:268.3989,da:0,de:0,dI:0,dL:146.4704,dlp:0,dnode:0,radiusKm:455,color:"#9a938b",tex:'rock',desc:"Anti-Pluto: similar orbit, opposite phase."},
 {id:"quaoar",name:"Quaoar",a:43.1935,e:0.0376,I:7.9912,L:251.7124,lp:352.1977,node:189.0472,da:0,de:0,dI:0,dL:126.8139,dlp:0,dnode:0,radiusKm:555,color:"#a08060",tex:'rock',desc:"Kuiper world with water ice and a dense ring."},
 {id:"sedna",name:"Sedna",a:552.1531,e:0.8618,I:11.9277,L:93.1752,lp:95.2687,node:144.3947,da:0,de:0,dI:0,dL:2.7746,dlp:0,dnode:0,radiusKm:500,color:"#c06040",tex:'rock',desc:"Detached object; ~11,400-year orbit into the dark."},
 {id:"varuna",name:"Varuna",a:2.7656,e:0.0547,I:17.1434,L:343.3635,lp:8.8255,node:97.2218,da:0,de:0,dI:0,dL:7827.1997,dlp:0,dnode:0,radiusKm:330,color:"#8d8578",tex:'rock',desc:"Fast rotator; elongated Kuiper belt object."},
];
export const COMETS = [
 {id:"comet-halebopp",name:"Hale-Bopp",a:185.8645,e:0.9951,I:89.4302,L:53.4514,lp:53.0603,node:282.4709,da:0,de:0,dI:0,dL:14.2069,dlp:0,dnode:0,q:0.9141,desc:"The Great Comet of 1997."},

 {id:"comet-halley",name:"1P/Halley",a:17.9416,e:0.9673,I:162.2392,L:235.7959,lp:169.99,node:58.1434,da:0,de:0,dI:0,dL:473.6977,dlp:0,dnode:0,q:0.5871,desc:"Most famous comet; returns every ~76 years."},
 {id:"comet-tempeltuttle",name:"55P/Tempel-Tuttle",a:10.2719,e:0.9044,I:162.7106,L:66.1685,lp:47.0152,node:234.4357,da:0,de:0,dI:0,dL:1093.4958,dlp:0,dnode:0,q:0.9817,desc:"Parent of the Leonid meteor storms."},
 {id:"comet-encke",name:"2P/Encke",a:2.2166,e:0.8471,I:12.3594,L:83.4575,lp:159.949,node:334.7189,da:0,de:0,dI:0,dL:10908.2401,dlp:0,dnode:0,q:0.339,desc:"Shortest-period bright comet (3.3 yr)."},
 {id:"comet-cg67p",name:"67P/Churyumov-Gerasimenko",a:3.5154,e:0.6302,I:7.1097,L:277.7441,lp:61.6941,node:50.3507,da:0,de:0,dI:0,dL:5461.6676,dlp:0,dnode:0,q:1.3,desc:"Rosetta rendezvous target (2014)."},
];
