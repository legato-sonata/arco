import ImageTracer from 'imagetracerjs';
import { optimize } from 'svgo/browser';

self.onmessage = (e) => {
	const { type, payload, id } = e.data;
	try {
		if (type === 'trace') {
			const { imgd, options } = payload;
			const svgstr = ImageTracer.imagedataToSVG(imgd, options);
			self.postMessage({ id, type: 'trace_done', result: svgstr });
		} else if (type === 'optimize') {
			const { originalSvg, options } = payload;
			const result = optimize(originalSvg, options);
			self.postMessage({ id, type: 'optimize_done', result: result.data });
		}
	} catch (err) {
		self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
	}
};
