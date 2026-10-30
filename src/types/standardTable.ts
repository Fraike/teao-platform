import type {HTMLAttributes,Ref} from 'react';
export interface StandardSelectableRowProps extends HTMLAttributes<HTMLElement> {
  as?:'tr'|'div';
  ref?:Ref<HTMLElement>;
  'data-row-key'?:string;
}
