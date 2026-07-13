const fs=require("fs");const{JSDOM}=require("jsdom");
const html=fs.readFileSync(process.argv[2]||"public/index.html","utf8");
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"http://localhost/",
 beforeParse(w){w.Path2D=class{moveTo(){}lineTo(){}closePath(){}};w.ResizeObserver=class{observe(){}disconnect(){}};
  w.fetch=()=>Promise.reject(new Error("yok"));w.WebSocket=class{constructor(){this.readyState=3}close(){}send(){}};
  w.HTMLCanvasElement.prototype.getContext=()=>null;w.requestAnimationFrame=f=>setTimeout(f,0);w.scrollTo=()=>{};}});
setTimeout(()=>{
 const E=s=>dom.window.eval(s); const D=E("DATA"), G=E("GEO");
 const parca=[];
 const duz=v=>{ if(v==null)return ""; if(typeof v==="string")return v;
   if(Array.isArray(v))return v.map(duz).filter(Boolean).join(" · ");
   if(typeof v==="object")return [v.l,v.u,v.t,v.m,v.a,v.b,v.tr,v.gr].map(duz).filter(Boolean).join(" — ");
   return String(v); };
 const ekle=(tur,baslik,metin,etiket)=>{ const m=duz(metin).replace(/\s+/g," ").trim(); if(!m||m.length<25)return;
   parca.push({tur,baslik:duz(baslik),metin:m,etiket:etiket||""}); };

 for(const a of D.antlasmalar||[])
   ekle("antlasma",`${a.ad} (${a.yil})`,[a.tarih,a.ozet,a.madde,a.tr,a.u,a.l].map(duz).filter(Boolean).join(" — "),a.id);
 for(const t of D.tezler||[])
   ekle("tez",duz(t.b||t.baslik||t.k||"Tez"),[t.tr,t.gr,t.hukuk,t.emsal].map(duz).filter(Boolean).join(" | "));
 for(const k of D.krizler||[])
   ekle("kriz",`${k.ad} (${k.yil})`,[k.ozet,k.sonuc,k.u,k.l].map(duz).filter(Boolean).join(" — "));
 for(const g of D.guncel||[])
   ekle("guncel",g.ad,[g.m,g.u].map(duz).filter(Boolean).join(" — "));
 for(const [k,v] of Object.entries(D.sozluk||{}))
   ekle("terim",k,duz(v));
 for(const [k,v] of Object.entries(D.katmanDetay||{}))
   ekle("katman",v.b,v.m,k);
 for(const a of D.adalar||[])
   ekle("ada",a.ad+(a.gr&&a.gr!=="—"?" ("+a.gr+")":""),a.aciklama||a.l||"",a.id);
 for(const [no,p] of Object.entries(D.parseller||{}))
   ekle("parsel",`GKRY ${no}. parsel`,[`Ruhsat: ${p.r}`,`Keşif: ${p.k}`,`İtiraz: ${p.i}`,p.n].filter(x=>x&&x!=="—").join(" — "));
 for(const [id,t] of Object.entries(D.turlar||{}))
   for(const ad of t.adimlar) ekle("tur",`${t.ad}: ${ad.b}`,ad.m);
 for(const q of D.quiz||[]) ekle("soru",q.s,q.a);
 for(const [k,v] of Object.entries(D.sovNot||{})) ekle("egemen",(G.sov[k]||{}).ad||k,v);

 const out={uretim:new Date().toISOString().slice(0,10),kaynak:"Mavi Vatan Atlası — kendi metinleri",parca};
 fs.writeFileSync("public/data/bilgi.json",JSON.stringify(out));
 const say={};for(const p of parca)say[p.tur]=(say[p.tur]||0)+1;
 console.log("parça:",parca.length);console.log(say);
 console.log("boyut:",(fs.statSync("public/data/bilgi.json").size/1024).toFixed(0),"KB");
 console.log("\nörnek:",JSON.stringify(parca.find(p=>p.tur==="antlasma"),null,1).slice(0,400));
 process.exit(0);
},1500);
