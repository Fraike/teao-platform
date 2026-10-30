import {useContext} from 'react';
import {Button,Image,Modal} from 'antd';
import {QuestionCircleOutlined} from '@ant-design/icons';
import {TabPageContext,useTabPage,useTabState} from '../lib/tabPageContext';
import styles from './ProductDrawingGuide.module.css';

export function ProductDrawingGuide(){
  const context=useContext(TabPageContext),{active}=useTabPage();
  const [open,setOpen]=useTabState('product:usage-guide:open',false);
  const [preview,setPreview]=useTabState('product:usage-guide:preview',false);
  const close=()=>{setPreview(false);setOpen(false);};
  return <><Button icon={<QuestionCircleOutlined />} onClick={()=>setOpen(true)}>使用指南</Button>
    <Modal title="商品资料与图纸使用指南" open={active&&open} onCancel={close} onOk={close} okText="知道了" cancelButtonProps={{hidden:true}} getContainer={context?.container||false} width={860} destroyOnHidden>
      {open&&<div className={styles.content}>
      <h3>列表怎么看</h3>
      <p>先在左侧选择成品或半成品分类。支持系列展示的分类，按「系列卡片 → 具体规格或零件 → 内部料号 → 商品详情」浏览；其他分类直接显示商品列表。</p>
      <p><strong>成品：</strong>T001 系列下可有 T001-15、T001-80 等不同扭矩规格，每个内部料号保留独立档案。</p>
      <p><strong>半成品：</strong>一个系列下有齿轮、下座、上盖等不同零件，也可能区分材料、颜色和结构，按具体内部料号查看。</p>
      <p>绳子用于 V109；绳子和 O 型圈直接按物料列表查看，不按系列分组。</p>
      <p>共用配件可在多个系列下找到，但还是同一个内部料号，整体数量按料号去重，各系列数量不能直接相加。没有明确型号的物料放在「未识别系列」。</p>
      <p>可搜索料号、型号、名称或材料，并筛选缺图等状态；返回列表会保留原分类、搜索及位置。「未关联金蝶」供 PMC 核对、补录或恢复商品。</p>
      <h3>商品详情怎么用</h3>
      <p>查看商品基本资料和生产图纸；成品可切换客户范围。上传和停用由具备图纸管理权限的人员操作。</p>
      <ol className={styles.steps}>
        <li><strong>检查</strong><p>核对内部料号、型号、结构、尺寸和版本；无图纸时直接上传。</p></li>
        <li><strong>错图先停用</strong><p>到「历史版本」找到问题图纸，点击「停用」并确认，再上传新版。</p></li>
        <li><strong>上传并复查</strong><p>返回「生产图纸」上传 PDF，填写图号与实际版本，确认上传并发布后复查。</p></li>
      </ol>
      <p>成品通用图不选客户；客户专用图选择对应客户标准。半成品仅供内部使用，无需选择客户。图纸主次按实际选择。</p>
      <p>文件要求：仅 PDF，单份最大 25MiB，每一页横向，文字方向正确。上传、停用需具备图纸管理权限。</p>
      <p>查看图纸：双击放大至 150%，再次双击恢复整页；按住鼠标左键拖动查看。也可旋转、下载和打印。</p>
      <p className={styles.note}>共用图需逐一核对适用料号，不会自动覆盖整个系列。点击下图可放大查看。</p>
      <div className={styles.graphic}><Image src="/assets/guides/drawing-guide-general.png" loading="lazy" alt="成品与半成品图纸检查与上传简版指引" preview={{visible:active&&open&&preview,onVisibleChange:setPreview,getContainer:()=>context?.container||document.body}} /></div>
      </div>}
    </Modal></>;
}
