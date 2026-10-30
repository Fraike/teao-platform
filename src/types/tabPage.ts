import type {ReactNode} from 'react';
import type {Location} from 'react-router-dom';
export interface TabPageRecord {
 scope:string; key:string; alive:boolean; instance:number; active?:boolean; snapshot:Map<string,unknown>; initialized:Map<string,readonly unknown[]>;
 effectMode?:'activity'|'managed'; adapted:boolean; adapterDeclared?:boolean; busy:Map<string,boolean>; dirty:Map<string,boolean>; disposers:Map<string,()=>void>;
 lastUsed:number; scrollTop:number; scrollLeft:number; location?:Location;
}
export interface TabPageContextValue { record:TabPageRecord; instance:number; active:boolean; restored:boolean; container:HTMLElement|null }
export interface TabPageHostProps {
 scope:string; tabs:readonly {key:string;location:Location}[]; activeKey:string;
 renderPage:(location:Location)=>ReactNode; maxHot?:number;
}

export interface TabPageAdapterOptions {effectMode?:'activity'|'managed'}

/** Only callbacks that finish their initialization synchronously may opt in. */
export interface TabInitialEffectOptions { synchronous?:boolean }
