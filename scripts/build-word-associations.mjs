// node scripts/build-word-associations.mjs, with CLOUD_SITE_PASSWORD set privately.
import { readFile, writeFile } from 'node:fs/promises';
import { pbkdf2Sync, randomBytes, createCipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function build(password){
 if(!password)throw new Error('Set CLOUD_SITE_PASSWORD before building.');
 const base=path.join(root,'web/word_associations');
 const [template,css,app,data,drive,csv]=await Promise.all([
  readFile(path.join(base,'.private/index.html'),'utf8'),readFile(path.join(base,'style.css'),'utf8'),readFile(path.join(base,'app.js'),'utf8'),readFile(path.join(base,'data.js'),'utf8'),readFile(path.join(base,'drive_ids.js'),'utf8'),readFile(path.join(root,'data/macro-categories.csv'),'utf8')
 ]);
 const safe=s=>s.replace(/<\/script/gi,'<\\/script');
 const standalone=app.replace('await fetch(path)','await Promise.resolve(new Response('+JSON.stringify(csv)+'))');
 if(standalone===app)throw new Error('Category loader changed; review build.');
 const html=template.replace('<link rel="stylesheet" href="style.css" />','<style>'+css+'</style>')
 .replace('<script src="data.js"></script>','<script>'+safe(data)+'</script>')
 .replace('<script src="drive_ids.js"></script>','<script>'+safe(drive)+'</script>')
 .replace('<script src="app.js"></script>','<script>'+safe(standalone)+'</script>');
 const salt=randomBytes(16),iv=randomBytes(12),iterations=600000;
 const cipher=createCipheriv('aes-256-gcm',pbkdf2Sync(password,salt,iterations,32,'sha256'),iv);
 const payload=Buffer.concat([cipher.update(html,'utf8'),cipher.final(),cipher.getAuthTag()]);
 await writeFile(path.join(base,'site.encrypted.json'),JSON.stringify({version:1,iterations,salt:salt.toString('base64'),iv:iv.toString('base64'),payload:payload.toString('base64')}));
 return {bytes:payload.length};
}
if(typeof process!=='undefined'&&process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await build(process.env.CLOUD_SITE_PASSWORD));
