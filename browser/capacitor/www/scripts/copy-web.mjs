import { cp, mkdir, readdir, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const source=path.resolve(here,'..');
const target=path.resolve(here,'..','www');
const excluded=new Set(['capacitor','node_modules','www','.git']);
await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
for(const entry of await readdir(source,{withFileTypes:true})){
  if(excluded.has(entry.name)||entry.name.startsWith('.'))continue;
  const src=path.join(source,entry.name);const dest=path.join(target,entry.name);
  if(entry.isDirectory()) await cp(src,dest,{recursive:true});
  else if(entry.isFile()) await cp(src,dest);
}
console.log(`Copied browser web files into ${target}`);
