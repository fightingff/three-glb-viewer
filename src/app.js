import WebGL from 'three/addons/capabilities/WebGL.js';
import { Viewer } from './viewer.js';
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
		this.viewer = null;
		this.viewerEl = null;
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

	/**
	 * Sets up the view manager.
	 * @return {Viewer}
	 */
	createViewer() {
		const viewerEl = document.createElement('div');
		viewerEl.style.cssText = 'width: 100%; height: 100%;';
		viewerEl.classList.add('viewer');
		this.wrapperEl.appendChild(viewerEl);
		this.viewerEl = viewerEl;
		this.viewer = new Viewer(viewerEl, this.options);
		return this.viewer;
	}

	/**
	 * Passes a model to the viewer, given file and resources.
	 * @param  {File|string} rootFile
	 * @param  {string} rootPath
	 * @param  {Map<string, File>} fileMap
	 */
	view() {
		if (this.viewer) {
			this.viewer.clear();
			this.viewer = null;
		}
		this.viewer = this.viewer || this.createViewer();

		// 加载参考模型
		let keyFrames = [0, 62, 91, 122, 123];
		let texts = [];
		let posx = [-4.5, -1.5, 1.5, 4.5];
		let posz = [0, 0, 0, 0];
		for (let i = 0; i < keyFrames.length - 1; i++) {
			this.viewer.load("/ref.glb", keyFrames[i], keyFrames[i + 1], true, '', posx[i], posz[i], i);
		}

		// 加载用户模型
		keyFrames = [0, 97, 134, 164, 165];
		texts = ['start', 'ready', 'lowest', 'end'];
		posz = [-3, -3, -3, -3];		
		for (let i = 0; i < keyFrames.length - 1; i++) {
			this.viewer.load("/clq_bind_v5.glb", keyFrames[i], keyFrames[i + 1], false, texts[i], posx[i], posz[i], i);
		}

		this.viewer.setDefaultCamera(0, 0.5, 4, 0, 0, 0);
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const app = new App(document.body, location);

	window.VIEWER.app = app;
});