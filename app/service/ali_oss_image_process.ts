import base64url from "base64url";
import BaseService from "../lib/BaseService";

export type GEOMETRY = 'nw' | 'north' | 'ne' | 'west' | 'center' | 'east' | 'sw' | 'south' | 'se';

class AliOssImageProcessOperator {
  private operator: string;
  private processes: string[];

  constructor(operator: string) {
    this.operator = operator;
    this.processes = [];
  }

  addProcess(process: string, value?: string | number | boolean) {
    if (value === undefined) {
      this.processes.push(process);
    } else {
      if (typeof value === 'boolean') {
        value = value ? '1' : '0';
      }

      this.processes.push(`${process}_${value}`);
    }

    return this;
  }

  addRGBProcess(process: string, value: number | string) {
    return this.addProcess(process, typeof value === 'number' ? value.toString(16).toUpperCase() : value);
  }

  toString() {
    return [this.operator, ...this.processes].join(',');
  }
}

/**
 * @see https://help.aliyun.com/document_detail/44688.html
 */
export class AliOssImageProcessResize extends AliOssImageProcessOperator {
  constructor() {
    super('resize');
  }

  /**
   *
    lfit（默认值）：等比缩放，缩放图限制为指定w与h的矩形内的最大图片。
    mfit：等比缩放，缩放图为延伸出指定w与h的矩形框外的最小图片。
    fill：将原图等比缩放为延伸出指定w与h的矩形框外的最小图片，之后将超出的部分进行居中裁剪。
    pad：将原图缩放为指定w与h的矩形内的最大图片，之后使用指定颜色居中填充空白部分。
    fixed：固定宽高，强制缩放。
   */
  mode(mode: 'lfit' | 'mfit' | 'fill' | 'pad' | 'fixed') {
    return this.addProcess('m', mode);
  }

  width(width: number) {
    return this.addProcess('w', width);
  }

  height(height: number) {
    return this.addProcess('h', height);
  }

  l(l: number) {
    return this.addProcess('l', l);
  }

  s(s: number) {
    return this.addProcess('s', s);
  }

  // 指定当目标缩放图大于原图时是否进行缩放。
  limit(limit: boolean) {
    return this.addProcess('limit', limit);
  }

  color(color: number | string) {
    return this.addRGBProcess('color', color);
  }
}

export class AliOssImageProcessWatermark extends AliOssImageProcessOperator {
  constructor() {
    super('watermark');
  }

  text(text: string) {
    return this.addProcess('text', base64url(text));
  }

  /**
   *
    wqy-zenhei	文泉驿正黑
    wqy-microhei	文泉微米黑
    fangzhengshusong	方正书宋
    fangzhengkaiti	方正楷体
    fangzhengheiti	方正黑体
    fangzhengfangsong	方正仿宋
    droidsansfallback	DroidSansFallback
  */
  font(font: 'wqy-zenhei' | 'wqy-microhei' | 'fangzhengshusong' | 'fangzhengkaiti' | 'fangzhengheiti' | 'fangzhengfangsong' | 'droidsansfallback') {
    return this.addProcess('type', base64url(font));
  }

  color(color: string | number) {
    return this.addRGBProcess('color', color);
  }

  size(size: number) {
    return this.addProcess('size', size);
  }

  shadow(shadow: number) {
    return this.addProcess('shadow', shadow);
  }

  rotate(rotate: number) {
    return this.addProcess('rotate', rotate);
  }

  fill(fill: boolean) {
    return this.addProcess('fill', fill);
  }

  transparent(transparent: number) {
    return this.addProcess('t', transparent);
  }

  t(t: number) {
    return this.transparent(t);
  }

  geometry(geometry: GEOMETRY) {
    return this.addProcess('g', geometry);
  }

  g(geometry: GEOMETRY) {
    return this.geometry(geometry);
  }

  x(x: number) {
    return this.addProcess('x', x);
  }

  y(y: number) {
    return this.addProcess('y', y);
  }

  voffset(voffset: number) {
    return this.addProcess('voffset', voffset);
  }

  image(image: string) {
    return this.addProcess('image', base64url(image));
  }

  /**
   * 水印图片预处理参数，指定图片水印按照主图的比例进行缩放，取值为缩放的百分比
   */
  preprocess(p: number) {
    return this.addProcess('P', p);
  }

  order(order: boolean) {
    return this.addProcess('order', order);
  }

  align(align: 0 | 1 | 2) {
    return this.addProcess('align', align);
  }

  interval(interval: number) {
    return this.addProcess('interval', interval);
  }
}

export class AliOssImageProcessCrop extends AliOssImageProcessOperator {
  constructor() {
    super('crop');
  }

  w(w: number) {
    return this.addProcess('w', w);
  }

  h(h: number) {
    return this.addProcess('h', h);
  }

  x(x: number) {
    return this.addProcess('x', x);
  }

  y(y: number) {
    return this.addProcess('y', y);
  }

  geometry(geometry: GEOMETRY) {
    return this.addProcess('g', geometry);
  }

  g(geometry: GEOMETRY) {
    return this.geometry(geometry);
  }
}

export class AliOssImageProcessQuality extends AliOssImageProcessOperator {
  constructor() {
    super('quality');
  }

  /**
   * 设置图片的相对质量，对原图按百分比进行质量压缩。
   */
  q(q: number) {
    return this.addProcess('q', q);
  }

  /**
   * 设置图片的绝对质量，将原图质量压缩至Q%
   */
  Q(Q: number) {
    return this.addProcess('Q', Q);
  }
}

export class AliOssImageProcessFormat extends AliOssImageProcessOperator {
  constructor() {
    super('format');
  }

  jpg() {
    return this.addProcess('jpg');
  }

  png() {
    return this.addProcess('png');
  }

  webp() {
    return this.addProcess('webp');
  }
}

export class AliOssImageProcessAutoOrient extends AliOssImageProcessOperator {
  constructor(autoOrient: boolean) {
    super('auto-orient');

    this.addProcess(autoOrient ? '1' : '0');
  }
}

export class AliOssImageProcessCircle extends AliOssImageProcessOperator {
  constructor() {
    super('circle');
  }

  r(r: number) {
    return this.addProcess('r', r);
  }
}

export class AliOssImageProcessRoundedCorners extends AliOssImageProcessOperator {
  constructor() {
    super('rounded-corners');
  }

  r(r: number) {
    return this.addProcess('r', r);
  }
}

export class AliOssImageProcessBlur extends AliOssImageProcessOperator {
  constructor() {
    super('blur');
  }

  r(r: number) {
    return this.addProcess('r', r);
  }

  s(s: number) {
    return this.addProcess('s', s);
  }
}

export class AliOssImageProcessRotate extends AliOssImageProcessOperator {
  constructor(value: number) {
    super('rotate');

    this.addProcess(`${value}`);
  }
}

export class AliOssImageProcess {
  private imageProcesses: string[];

  constructor() {
    this.imageProcesses = [];
  }

  process(process: AliOssImageProcessOperator) {
    this.imageProcesses.push(process.toString());
    return this;
  }

  toString() {
    return ['image', ...this.imageProcesses].join('/');
  }

  forUrl(url: string) {
    const u = new URL(url);

    let existing = u.searchParams.get('x-oss-process')?.split('/') ?? [];
    if (existing && existing.length > 0 && existing[0] === 'image') {
      existing = existing.splice(0, 1);
    }

    u.searchParams.delete('x-oss-process');

    if (existing.length > 0 ||this.imageProcesses.length > 0) {
      u.search = '?' + [...(u.searchParams.toString() ? [u.searchParams.toString()] : []), `x-oss-process=${['image', ...(existing ?? []), ...this.imageProcesses].join('/')}` ].join('&');
    }

    return u.toString();
  }
}

export default class AliOssImageProcessService extends BaseService {
  process() {
    return new AliOssImageProcess();
  }
}
