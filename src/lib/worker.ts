import ImageTracer from 'imagetracerjs';
import { optimize } from 'svgo/browser';

self.onmessage = (e) => {
	const { type, payload, id } = e.data;
	try {
		if (type === 'trace') {
			const { imgd, preBw, preThreshold, preInvert, options } = payload;
			
			if (preBw || preInvert) {
				const data = imgd.data;
				const threshold = preThreshold ?? 128;
				for (let i = 0; i < data.length; i += 4) {
					let r = data[i];
					let g = data[i+1];
					let b = data[i+2];
					
					if (preBw) {
						const lum = 0.299 * r + 0.587 * g + 0.114 * b;
						const val = lum >= threshold ? 255 : 0;
						r = val; g = val; b = val;
					}
					
					if (preInvert) {
						r = 255 - r;
						g = 255 - g;
						b = 255 - b;
					}
					
					data[i] = r;
					data[i+1] = g;
					data[i+2] = b;
				}
			}

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
