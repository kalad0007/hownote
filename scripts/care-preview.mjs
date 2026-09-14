// Review artifact only: no production password or report. Never copy into public/.
import {readFileSync,writeFileSync} from 'node:fs';
let html=readFileSync('dist/care/index.html','utf8');
const fixture=JSON.parse(readFileSync('tests/fixtures/care-briefing.json','utf8'));
html=html.replace(/<link[^>]+href="\/(?:site.webmanifest|favicon.svg)"[^>]*>/g,'');
html=html.replace(/<link rel="stylesheet" href="([^"]+)"[^>]*>/g,(_,src)=>`<style>${readFileSync('dist'+src,'utf8')}</style>`);
const mock=`
const previewReport=${JSON.stringify({...fixture,comments:[]})};
let previewReader={id:'andy',name:'Andy'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async function(path,options={}) {
 const url=new URL(path,'https://hownote.net'); const input=options.body?JSON.parse(options.body):{};
 if(url.pathname.endsWith('/login')){previewReader={id:'andy',name:'Andy'};return reply({user:previewReader});}
 if(!previewReader)return reply({error:'로그인이 필요합니다.'},401);
 if(url.pathname.endsWith('/me'))return reply({user:previewReader});
 if(url.pathname.endsWith('/logout')){previewReader=null;return reply({ok:true});}
 if(url.pathname.endsWith('/comments')){const comment={...input,user_id:previewReader.id,author:previewReader.name,date:previewReport.date,created:new Date().toISOString()};previewReport.comments.push(comment);return reply({comment},201);}
 if(url.pathname.endsWith('/briefings'))return reply({items:previewReport.title.includes(url.searchParams.get('q')||'')?[{...previewReport,comments:previewReport.comments.length}]:[],next:null});
 return reply(previewReport);
};
history.replaceState=()=>{};
document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();location.reload();});
`;
html=html.replace(/<script type="module" src="([^"]+)"[^>]*><\/script>/g,(_,src)=>`<script>${mock}</script><script type="module">${readFileSync('dist'+src,'utf8').replaceAll('</script','<\\/script')}</script>`);
html=html.replace('<body>','<body><div style="background:#e7e5d8;color:#526255;text-align:center;padding:10px 18px;font-size:11px;line-height:1.6">화면 확인용 예시 · 의견은 이 화면에서만 유지됩니다</div>');
writeFileSync('docs/care-preview.html',html);
console.log('Created docs/care-preview.html (sample data only).');
