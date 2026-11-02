import {useContext} from 'react';
import {Alert,Button,Modal} from 'antd';
import {TabPageContext} from '../lib/tabPageContext';
import styles from './PageLoadFailure.module.css';

export function PageLoadFailure(){
 const context=useContext(TabPageContext);
 return <div className={styles.notice}>
  <Alert type="warning" showIcon title="页面资源加载失败" description="可能是网络异常或系统版本已更新。请先切回其他标签保存未完成的编辑，再刷新整个页面；若仍有问题，请联系管理员。" />
  <Button onClick={()=>Modal.confirm({title:'确认刷新整个页面？',content:'请先保存所有标签中未完成的编辑。刷新会清空页面内存状态。',getContainer:context?.container||false,onOk:()=>window.location.reload()})}>刷新整个页面</Button>
 </div>;
}
