import {Tag} from 'antd';
import {useStandardDrawingBadge} from '../../lib/useStandardDrawingStatus';
export function StandardDrawingBadge({id}:{id:string}){
 const hasDrawing=useStandardDrawingBadge(id);
 return hasDrawing===false?<Tag>无图纸</Tag>:null;
}
