export type DocumentViewport = {zoom:number;x:number;y:number};
export const defaultViewport = ():DocumentViewport => ({zoom:1,x:0,y:0});
export const clampZoom = (zoom:number) => Math.max(1,Math.min(4,Number.isFinite(zoom)?zoom:1));
export const panelLimit = (availableHeight:number) => Math.max(0,availableHeight-196);
export const clampPanelHeight = (height:number,availableHeight:number) => Math.max(0,Math.min(panelLimit(availableHeight),Number.isFinite(height)?height:190));
