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
		this.screenEl = el.querySelector('.screen');

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
		this.viewerEl = document.createElement('div');
		this.viewerEl.classList.add('viewer');
		this.screenEl.appendChild(this.viewerEl);
		this.viewer = new Viewer(this.viewerEl, this.options, "/ref.mp4");
		return this.viewer;
	}

	/**
	 * Passes a model to the viewer, given file and resources.
	 */
	view() {
		if (this.viewer) this.viewer.clear();
		const viewer = this.viewer || this.createViewer();
		viewer.load("/ref.glb").then(() => {
			const keyFrames = [0, 62, 91, 123];
			viewer.setKeyFrames(keyFrames);
			viewer.setKeyFrame(0);
		});
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const app = new App(document.body, location);
	window.VIEWER.app = app;
});
