// Offline source build only. Node 24 strips TypeScript; resolve the browser parsers' extensionless imports.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
registerHooks({resolve(specifier,context,nextResolve){
  if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')){
    const url=new URL(specifier,context.parentURL);
    if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts')) return {url:url.href+'.ts',shortCircuit:true};
  }
  return nextResolve(specifier,context);
}});
