import fs from 'node:fs';
import path from 'node:path';
import {allowedArtifact,digest,inside} from './release-common.js';

/** Keep only assets named by the two preceding releases, never arbitrary site files. */
export function retainPreviousStaticAssets(site,incoming,stateFile){
  const retained=[],visited=new Set(),realSite=fs.realpathSync(site);
  while(stateFile&&visited.size<2&&fs.existsSync(stateFile)){
    if(visited.has(stateFile))break;
    visited.add(stateFile);
    const previous=JSON.parse(fs.readFileSync(stateFile,'utf8'));
    for(const file of previous.manifest||[]){
      if(!file.name.startsWith('dist/assets/')||!allowedArtifact(file.name))continue;
      const name=file.name.slice(5),source=path.join(site,name),destination=path.join(incoming,name);
      if(fs.existsSync(destination)||!fs.existsSync(source))continue;
      if(!inside(realSite,fs.realpathSync(source))||fs.lstatSync(source).isSymbolicLink())throw new Error('历史静态资源路径无效');
      if(digest(fs.readFileSync(source))!==file.sha256)throw new Error('历史静态资源校验失败');
      fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o755});
      fs.copyFileSync(source,destination,fs.constants.COPYFILE_EXCL);fs.chmodSync(destination,0o644);
      retained.push({name:file.name,sha256:file.sha256});
    }
    stateFile=previous.previousStateFile;
  }
  return retained;
}
