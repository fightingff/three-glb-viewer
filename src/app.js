import WebGL from 'three/addons/capabilities/WebGL.js';
import { Viewer } from './viewer.js';
import { SimpleDropzone } from 'simple-dropzone';
import { Validator } from './validator.js';
import { Footer } from './components/footer';
import queryString from 'query-string';

window.VIEWER = {};

if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
	console.error('The File APIs are not fully supported in this browser.');
} else if (!WebGL.isWebGLAvailable()) {
	console.error('WebGL is not supported in this browser.');
}

class App {
	/**
	 * @param  {Element} el
	 * @param  {Location} location
	 */
	constructor(el, location) {
		const hash = location.hash ? queryString.parse(location.hash) : {};
		this.options = {
			kiosk: Boolean(hash.kiosk),
			model: hash.model || '',
			preset: hash.preset || '',
			cameraPosition: hash.cameraPosition ? hash.cameraPosition.split(',').map(Number) : null,
		};

		this.el = el;
		this.viewers = null;
		this.viewerEls = null;
		this.wrapperEl = el.querySelector('.wrap');
		this.activateIndex = null;

		const options = this.options;

		if (options.kiosk) {
			const headerEl = document.querySelector('header');
			headerEl.style.display = 'none';
		}

		if (options.model) {
			this.view(options.model, '', new Map());
		}

		this.view();
	}

	activate(index) {
		if (index === this.activateIndex) return;
		if (this.activateIndex !== null) {
			this.viewers[this.activateIndex].deactivate();
		}
		this.activateIndex = index;
		this.viewers[index].activate();
	}

	/**
	 * Sets up the view manager.
	 * @return {Viewer}
	 */
	createViewers(num_keyframes) {
		// 创建num_keyframes个viewer
		this.viewerEls = [];
		this.viewers = [];
		for (let i = 0; i < num_keyframes; i++) {
			const viewerEl = document.createElement('div');
			viewerEl.style.cssText = `
				width: ${100 / num_keyframes}%;
				height: 100%;
				left: ${100 / num_keyframes * i}%;
			`;
			viewerEl.classList.add('viewer');
			viewerEl.addEventListener('mousedown', () => {
				this.activate(i);
			});
			this.wrapperEl.appendChild(viewerEl);
			this.viewerEls.push(viewerEl);
			this.viewers.push(new Viewer(viewerEl, this.options, i + 1));
		}
		return this.viewers;
	}

	/**
	 * Passes a model to the viewer, given file and resources.
	 * @param  {File|string} rootFile
	 * @param  {string} rootPath
	 * @param  {Map<string, File>} fileMap
	 */
	view() {
		if (this.viewers) {
			this.viewers.forEach((viewer) => viewer.clear());
			this.viewers = null;
		}
		const viewers = this.viewers || this.createViewers(3);

		// 加载参考模型
		let keyFrames = [0, 62, 91, 123];
		let texts = [];
		for (let i = 0; i < viewers.length; i++) {
			viewers[i].load("/ref.glb", keyFrames[i], keyFrames[i + 1], true);
		}

		// 加载用户模型
		keyFrames = [0, 97, 134, 165];
		texts = ['start', 'ready', 'lowest'];		
		for (let i = 0; i < viewers.length; i++) {
			viewers[i].load("/clq_bind_v5.glb", keyFrames[i], keyFrames[i + 1], false, texts[i]);
		}
	}
}

document.body.innerHTML += Footer();

document.addEventListener('DOMContentLoaded', () => {
	const app = new App(document.body, location);

	window.VIEWER.app = app;
});