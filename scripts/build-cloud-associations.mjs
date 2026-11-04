// Rebuild the protected static site: node scripts/build-cloud-associations.mjs
// Supply CLOUD_SITE_PASSWORD in the environment; never commit it.
import { readFile, writeFile } from 'node:fs/promises';
import { pbkdf2Sync, randomBytes, createCipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function build(password){
 if(!password)throw new Error('Set CLOUD_SITE_PASSWORD before building.');
 const base=path.join(root,'web/cloud_associations');
 const [template,css,app,data,csv,logo]=await Promise.all([
  readFile(path.join(base,'.private/index.html'),'utf8'),readFile(path.join(base,'style.css'),'utf8'),readFile(path.join(base,'app.js'),'utf8'),readFile(path.join(root,'web/word_associations/data.js'),'utf8'),readFile(path.join(root,'data/macro-categories.csv'),'utf8'),readFile(path.join(base,'buell-center-logo.png'))
 ]);
 const safeScript=s=>s.replace(/<\/script/gi,'<\\/script');
 const standaloneApp=app.replace("fetch('../../data/macro-categories.csv')",'Promise.resolve(new Response('+JSON.stringify(csv)+'))');
 if(standaloneApp===app)throw new Error('Category loader changed; update the protected build.');
 let html=template.replace('<link rel="stylesheet" href="style.css">','<style>'+css+'</style>')
  .replace('src="buell-center-logo.png"','src="data:image/png;base64,'+logo.toString('base64')+'"')
  .replace('<script src="../word_associations/data.js"></script>','<script>'+safeScript(data)+'</script>')
  .replace('<script src="app.js"></script>','<script>'+safeScript(standaloneApp)+'</script>');
 const salt=randomBytes(16),iv=randomBytes(12),iterations=600000;
 const key=pbkdf2Sync(password,salt,iterations,32,'sha256');
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 const payload=Buffer.concat([cipher.update(html,'utf8'),cipher.final(),cipher.getAuthTag()]);
 await writeFile(path.join(base,'site.encrypted.json'),JSON.stringify({version:1,iterations,salt:salt.toString('base64'),iv:iv.toString('base64'),payload:payload.toString('base64')}));
 return {bytes:payload.length};
}
if(typeof process!=='undefined'&&process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){console.log(await build(process.env.CLOUD_SITE_PASSWORD));}
