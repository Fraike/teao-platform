import {createElement,lazy} from 'react';
import type {ComponentType} from 'react';
import {PageLoadFailure} from '../components/PageLoadFailure';

export function lazyWithFallback<Props extends object>(load:()=>Promise<{default:ComponentType<Props>}>){
 return lazy(async():Promise<{default:ComponentType<Props>}>=>{
  try{return await load();}
  catch{return {default:()=>createElement(PageLoadFailure)};}
 });
}
