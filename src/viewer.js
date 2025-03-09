import {
	AmbientLight,
	AnimationMixer,
	AxesHelper,
	Box3,
	Cache,
	Color,
	DirectionalLight,
	GridHelper,
	HemisphereLight,
	LoaderUtils,
	LoadingManager,
	PMREMGenerator,
	PerspectiveCamera,
	PointsMaterial,
	REVISION,
	Scene,
	SkeletonHelper,
	Vector2,
	Vector3,
	WebGLRenderer,
	LinearToneMapping,
	ACESFilmicToneMapping,
	Mesh,
	RingGeometry,
	MeshBasicMaterial,
	DoubleSide,
	Raycaster,
	PlaneGeometry,
	AnimationUtils,
	Line,
	BufferGeometry
} from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/Addons.js';

import { GUI } from 'dat.gui';

import { environments } from './environments.js';

const DEFAULT_CAMERA = '[default]';

const MANAGER = new LoadingManager();
const THREE_PATH = `https://unpkg.com/three@0.${REVISION}.x`;
const DRACO_LOADER = new DRACOLoader(MANAGER).setDecoderPath(
	`${THREE_PATH}/examples/jsm/libs/draco/gltf/`,
);
const KTX2_LOADER = new KTX2Loader(MANAGER).setTranscoderPath(
	`${THREE_PATH}/examples/jsm/libs/basis/`,
);

const Preset = { ASSET_GENERATOR: 'assetgenerator' };

Cache.enabled = true;
const fps = 24;

export class Viewer {
	constructor(el, options, number) {
		this.el = el;
		this.options = options;

		this.lights = [];
		/*
		 为了编程（修改）方便，保留了以下全局属性
		 this.clip = this.clips[this.activeIndex];
		 this.mixer = this.mixers[this.activeIndex];
		 this.content = this.contents[this.activeIndex];
		*/
		this.activated = false;
		this.content = null;
		this.mixer = null;
		this.clip = null;
		this.circles = [];

		// 所有模型都放在数组中
		this.activeIndex = 0;
		this.contents = [];
		this.clips = [];
		this.mixers = [];
		this.labels = [];

		// 新增CSS2D渲染器初始化
		this.labelRenderer = new CSS2DRenderer();
		this.labelRenderer.setSize(el.clientWidth, el.clientHeight);
		this.labelRenderer.domElement.style.position = 'absolute';
		this.labelRenderer.domElement.style.top = '0';
		this.labelRenderer.domElement.style.pointerEvents = 'none';
		el.appendChild(this.labelRenderer.domElement);

		this.gui = null;

		this.state = {
			environment:
				options.preset === Preset.ASSET_GENERATOR
					? environments.find((e) => e.id === 'footprint-court').name
					: environments[1].name,
			background: false,
			playbackSpeed: 0.5,
			actionStates: {},
			camera: DEFAULT_CAMERA,
			wireframe: false,
			skeleton: false,
			grid: false,
			autoRotate: false,
			isPlaying: true,
			progress: 0,

			// Lights
			punctualLights: true,
			exposure: 0.0,
			toneMapping: LinearToneMapping,
			ambientIntensity: 0.3,
			ambientColor: '#FFFFFF',
			directIntensity: 0.8 * Math.PI, // TODO(#116)
			directColor: '#FFFFFF',
			bgColor: '#FAFAFA',

			pointSize: 1.0,
		};

		this.prevTime = 0;

		this.stats = new Stats();
		this.stats.dom.height = '48px';
		[].forEach.call(this.stats.dom.children, (child) => (child.style.display = ''));

		this.backgroundColor = new Color(this.state.bgColor);

		this.scene = new Scene();
		this.scene.background = this.backgroundColor;

		const fov = options.preset === Preset.ASSET_GENERATOR ? (0.8 * 180) / Math.PI : 60;
		const aspect = el.clientWidth / el.clientHeight;
		this.defaultCamera = new PerspectiveCamera(fov, aspect, 0.01, 1000);
		this.activeCamera = this.defaultCamera;
		this.scene.add(this.defaultCamera);

		this.renderer = window.renderer = new WebGLRenderer({ antialias: true, alpha: true });
		this.renderer.setClearColor(0xcccccc);
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(el.clientWidth, el.clientHeight);

		this.pmremGenerator = new PMREMGenerator(this.renderer);
		this.pmremGenerator.compileEquirectangularShader();

		this.neutralEnvironment = this.pmremGenerator.fromScene(new RoomEnvironment()).texture;

		this.controls = new OrbitControls(this.defaultCamera, this.renderer.domElement);
		this.controls.screenSpacePanning = true;

		// for debugging
		// this.controls.addEventListener('change', () => {
		// 	const data = {
		// 	  position: this.controls.object.position.toArray(),
		// 	  target: this.controls.target.toArray(),
		// 	  zoom: this.controls.object.zoom,
		// 	  rotation: this.controls.object.rotation.toArray()
		// 	};
			
		// 	console.log('[Camera Update]', data);
		// });
		/*
			position: (3) [1.7578285440729613, 1.5392933972663534, 2.2367909549919216]
			rotation: (4) [-0.16531715936401808, 0.32933913250404134, 0.05390668627904448, 'XYZ']
			target: (3) [0.5696888275716602, 0.9672218134681669, -1.192075950944766]
		*/

		this.el.appendChild(this.renderer.domElement);

		this.cameraCtrl = null;
		this.cameraFolder = null;
		this.animFolder = null;
		this.animCtrls = [];
		this.morphFolder = null;
		this.morphCtrls = [];
		this.skeletonHelpers = [];
		this.gridHelper = null;
		this.axesHelper = null;

		// 添加自定义进度条容器
		this.progressContainer = document.createElement('div');
		this.progressContainer.style.cssText = `
			position: absolute;
			bottom: 5%;
			width: 83%; 
			height: 2.6%;
			background-color: #D9D9D9;
			cursor: pointer;
			left: 16%;
			transform: skewX(-20deg);
		`;

		// 进度条主体
		this.progressBar = document.createElement('div');
		this.progressBar.style.cssText = `
			width: 0%;
			height: 100%;
			background: linear-gradient(90deg, #00ff88 0%,rgb(255, 38, 0) 100%);
			transition: width 0.01s cubic-bezier(0.4, 0, 0.2, 1); 
			position: relative;
			border-top-right-radius: 20px;
			border-bottom-right-radius: 20px;
		`;

        this.progressContainer.appendChild(this.progressBar);
        this.el.appendChild(this.progressContainer);

        // 添加进度条交互事件
        this.isDragging = false;
        this.progressContainer.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            // this.state.isPlaying = false;
            this.handleProgressClick(e);
        });

        this.progressContainer.addEventListener('mousemove', (e) => {
            if (this.isDragging) this.handleProgressClick(e);
        });

		this.progressContainer.addEventListener('mouseup', (e) => {
			if (this.isDragging) {
				this.isDragging = false;
				this.state.isPlaying = false;
				this.handleProgressClick(e);
				this.playButton.innerHTML='<img src="/play.png">';
				
				const action = this.mixer.clipAction(this.clip);
				action.paused = true;
			}
		});

		// 在开头添加关键帧标志：一个圆中包含一个数字
		const label = document.createElement('span');
		label.style.cssText = `
			position: absolute;
			bottom: 3%;
			left: 6%;
			color: red;
			font-size: 3rem;
			transform: rotate(20deg);
		`;
		label.innerHTML = number;
		this.el.appendChild(label);

		this.label_circle = document.createElement('div');
		this.label_circle.style.cssText = `
			position: absolute;
			bottom: 1.3%;
			left: 2%;
			width: 12%;
			height: 10%;
			border-radius: 50%;
			background-color: transparent;
			border: 10px outset 0xC59CF4;
			transform: rotate(20deg) perspective(500px) rotateX(-15deg);
			box-shadow: 
				inset 3px 3px 8px rgba(0,0,0,0.3),
				0 0 20px 5px rgba(128,0,128,0.4),
				5px 5px 15px rgba(0,0,0,0.5);
	  	`;
		this.el.appendChild(this.label_circle);

		
		// 添加播放控制按钮
		this.playButton = document.createElement('div');
		this.playButton.style.cssText=`
			position: absolute;
			bottom: 8%;
			right: 3%;
			height: 16%;
			cursor: pointer;
			display: flex;
			justify-content: center;
			align-items: center;
		`;

		this.playButton.innerHTML = '<img src="/play.png">';
		this.playButton.addEventListener('click', () => {
			// console.log('click');
			this.togglePlay();
			this.playButton.innerHTML = this.state.isPlaying ? '<img src="/pause.png">' : '<img src="/play.png">';
			this.playButton.style.display = this.activated ? 'flex' : 'none';
		});

		// 初始化时设置播放按钮状态
		this.playButton.innerHTML = this.state.isPlaying ? '<img src="/pause.png">' : '<img src="/play.png">';
		this.playButton.style.display = this.activated ? 'flex' : 'none';

		this.el.appendChild(this.playButton);

		this.addAxesHelper();
		this.addGUI();
		if (options.kiosk) this.gui.close();

		this.animate = this.animate.bind(this);
		requestAnimationFrame(this.animate);
		window.addEventListener('resize', this.resize.bind(this), false);
		// this.togglePlay();

		// 鼠标交互
		this.mouse = new Vector2();
		this.raycaster = new Raycaster();

		// 添加地面帮助获得鼠标位置
		const groundGeometry = new PlaneGeometry(100, 100);
		const groundMaterial = new MeshBasicMaterial({ visible: false });
		this.ground = new Mesh(groundGeometry, groundMaterial);
		this.ground.rotation.x = -Math.PI/2;
		this.scene.add(this.ground);

		// TODO: mousehover指示

		// 旋转模型
		this.isRotating = false;
		this.prevAngle = 0;
		this.renderer.domElement.addEventListener('mousedown', (event) => {
			const intersect = this.getObject(event);
			if (intersect) {
				const object = intersect.object;
				const point = intersect.point;
				if (object == this.circles[0]) {
					this.isRotating = true;
					this.circles[0].material.color.set(0x00ff00);
					this.prevAngle = Math.atan2(point.z - this.content.position.z, point.x - this.content.position.x);
				}
			}
		});

		this.renderer.domElement.addEventListener('mousemove', (event) => {
			if (this.isRotating) {
				const point = this.getObject(event).point;
				const angle = Math.atan2(point.z - this.content.position.z, point.x - this.content.position.x);
				this.content.rotation.y -= angle - this.prevAngle;
				this.prevAngle = angle;
			}
		});

		this.renderer.domElement.addEventListener('mouseup', () => {
			this.circles[0].material.color.set(0xC59CF4);
			this.isRotating = false;
		});

		this.renderer.domElement.addEventListener('click', (event) => {
			const intersect = this.getObject(event);

			if (intersect) {
				const object = intersect.object;
				const index = this.contents.indexOf(object.parent.parent);
				console.log(index, this.activeIndex);
				if (index !== -1) {
					if (index === this.activeIndex) return;
					[this.contents[index].position.z, this.contents[this.activeIndex].position.z] = 
						[this.contents[this.activeIndex].position.z, this.contents[index].position.z];
					// [this.labels[index].position.z, this.labels[this.activeIndex].position.z] =
					// 	[this.labels[this.activeIndex].position.z, this.labels[index].position.z];
					
					// TODO: 使用动画切换模型位置

					this.activeIndex = index;
					this.clip = this.clips[this.activeIndex];
					this.mixer = this.mixers[this.activeIndex];
					this.content = this.contents[this.activeIndex];
				}
			}
		}
		);
	}

	getObject(event) {
		const rect = this.renderer.domElement.getBoundingClientRect();
		this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		this.raycaster.setFromCamera(this.mouse, this.defaultCamera);
		const intersects = this.raycaster.intersectObjects(this.scene.children, true);
		return intersects.length > 0 ? intersects[0] : null;
	}

	activate() {
		this.activated = true;
		this.circles.forEach((circle) => this.scene.add(circle));
		this.playButton.style.display = 'flex';

		// 样式优化
		this.label_circle.style.background = `
			radial-gradient(circle at 30% 30%, 
			rgba(255,255,255,0.3) 0%,
			rgba(128,0,128,0.6) 60%,
			rgba(64,0,64,0.8) 100%)
		`;
		this.progressContainer.style.boxShadow = '0 0 5px 5px rgba(128,0,128,0.4)';
	}

	deactivate() {
		if (this.state.isPlaying){
			this.togglePlay();
		}
		// 清空播放进度
		this.seekAnimation(0);
		this.activated = false;
		this.circles.forEach((circle) => this.scene.remove(circle));
		this.playButton.style.display = 'none';

		// 样式优化
		this.label_circle.style.background = 'transparent';
		this.progressContainer.style.boxShadow = 'none';
	}

	animate(time) {
		requestAnimationFrame(this.animate);
		const dt = (time - this.prevTime) / 1000;
		
		this.controls.update();
		this.stats.update();
		
		if (this.mixer) {
			// 只在播放时更新动画时间
			const scaledDelta = this.state.isPlaying ? dt * this.state.playbackSpeed : 0;
			this.mixer.update(scaledDelta);
	
			// 更新进度条显示
			const progress = (this.mixer.time % this.clip.duration) / this.clip.duration;
			this.progressBar.style.width = `${progress * 100}%`;

		}

		this.render();
		this.prevTime = time;
	}

    handleProgressClick(e) {
        const rect = this.progressContainer.getBoundingClientRect();
		const progress = (e.clientX - rect.left) / rect.width;
        this.seekAnimation(progress);
    }

    seekAnimation(progress) {
        const targetTime = progress * this.clip.duration;
		// console.log(clip.duration);
        this.mixer.setTime(targetTime);
		const action = this.mixer.clipAction(this.clip);
		action.paused = false;
    }

	render() {
		this.renderer.render(this.scene, this.activeCamera);
		this.labelRenderer.render(this.scene, this.activeCamera); // 渲染CSS2D标签
		if (this.state.grid) {
			this.axesCamera.position.copy(this.defaultCamera.position);
			this.axesCamera.lookAt(this.axesScene.position);
			this.axesRenderer.render(this.axesScene, this.axesCamera);
		}
	}

	resize() {
		const { clientHeight, clientWidth } = this.el.parentElement;

		this.defaultCamera.aspect = clientWidth / clientHeight;
		this.defaultCamera.updateProjectionMatrix();
		this.renderer.setSize(clientWidth, clientHeight);

		this.axesCamera.aspect = this.axesDiv.clientWidth / this.axesDiv.clientHeight;
		this.axesCamera.updateProjectionMatrix();
		this.axesRenderer.setSize(this.axesDiv.clientWidth, this.axesDiv.clientHeight);
	}

	createText(text, object){
		// 创建HTML元素
		const labelDiv = document.createElement('div');
		labelDiv.textContent = text;
		labelDiv.style.cssText = `
		  color: black;
		  background: transparent;
		  font-size: 30px;
		`;
	
		// 创建CSS2D对象并定位
		const label = new CSS2DObject(labelDiv);
		label.position.set(-1, 0, 0);
		object.add(label);
		this.labels.push(label);
	}

	load(url, Lf=0, Rf=100, std=true, text='') {
		return new Promise((resolve, reject) => {

			const loader = new GLTFLoader(MANAGER)
				.setCrossOrigin('anonymous')
				.setDRACOLoader(DRACO_LOADER)
				.setKTX2Loader(KTX2_LOADER.detectSupport(this.renderer))
				.setMeshoptDecoder(MeshoptDecoder);

			loader.load(
				url,
				(gltf) => {
					window.VIEWER.json = gltf;

					const scene = gltf.scene || gltf.scenes[0];
					const clips = gltf.animations || [];

					console.log(clips);

					if (!scene) {
						// Valid, but not supported by this viewer.
						throw new Error(
							'This model contains no scene, and cannot be viewed here. However,' +
								' it may contain individual 3D resources.',
						);
					}

					if (std){
						this.setContent(scene, clips, Lf, Rf, 'std');
					}else{
						this.addWrongContent(scene, clips[0], -0.7, Lf, Rf, text);
					}

					resolve(gltf);
				},
				undefined,
				reject,
			);
		});
	}

	addWrongContent(object, clip, offset, Lf, Rf, text) {
		object.updateMatrixWorld();
		const box = new Box3().setFromObject(object);
		const size = box.getSize(new Vector3()).length();

		object.rotation.y = -Math.PI / 2.0;
		object.position.x += size * 0.3;
		object.position.z += size * offset * (this.contents.length - 1);


		// 绘制一条线段从上一个模型的圆心到当前模型的圆心
		const last = this.circles[this.circles.length - 1];
		const delta = 0.02;
		const points = [
			new Vector3(last.position.x, 0, last.position.z - last.geometry.parameters.outerRadius + delta),
			new Vector3(object.position.x, 0, object.position.z + size * 0.18 - delta),
		];
		const line = new Line(
			new BufferGeometry().setFromPoints(points),
			new MeshBasicMaterial({ color: 0xC59CF4 })
		);
		line.material.linewidth = 6; // 设置线段宽度
		this.circles.push(line);

		// 绘制一个小半径为size，圆心为（x, 0, z），平行于xz平面的圆环
		const circle = new Mesh(
			new RingGeometry(size * 0.15, size * 0.18),
			new MeshBasicMaterial({ color: 0xD9D9D9, side: DoubleSide, depthWrite: true }),
		);
		circle.rotation.x = Math.PI / 2;
		circle.position.set(object.position.x, 0, object.position.z);
		this.circles.push(circle);

		// 添加文字标签
		this.createText(text, object);

		this.scene.add(object);
		this.contents.push(object);

		let mixer = new AnimationMixer(object);
		const subClip = AnimationUtils.subclip(clip, 'subClip', Lf, Rf);
		mixer.clipAction(subClip).reset().play();
		mixer.update(0);
		this.mixers.push(mixer);
		this.clips.push(subClip);
	}

	/**
	 * @param {THREE.Object3D} object
	 * @param {Array<THREE.AnimationClip} clips
	 */
	setContent(object, clips, Lf, Rf, text) {
		this.clear();

		object.updateMatrixWorld(); // donmccurdy/three-gltf-viewer#330

		const box = new Box3().setFromObject(object);
		const size = box.getSize(new Vector3()).length();

		this.controls.reset();

		// 旋转模型使得人体模型面部朝向z轴正方向
		object.rotation.y = -Math.PI / 2.0;
		object.position.x += size * 0.3;
		object.position.z += size * 0.6;

		// 绘制一个小半径为size，圆心为（x, 0, z），平行于xz平面的圆环
		const circle = new Mesh(
			new RingGeometry(size * 0.25, size * 0.28),
			new MeshBasicMaterial({ color: 0xC59CF4, side: DoubleSide, depthWrite: true }),
		);
		circle.rotation.x = Math.PI / 2;
		circle.position.set(object.position.x, 0, object.position.z);
		this.circles.push(circle);

		// 添加文字标签
		this.createText(text, object);

		this.controls.maxDistance = size * 10;
		this.defaultCamera.position.set(0, 0, size * 2.5);
		this.defaultCamera.near = size / 100;
		this.defaultCamera.far = size * 100;
		this.defaultCamera.updateProjectionMatrix();

		if (this.options.cameraPosition) {
			this.defaultCamera.position.fromArray(this.options.cameraPosition);
			this.defaultCamera.lookAt(new Vector3());
		} else {
			this.defaultCamera.position.x = size;
			this.defaultCamera.position.y = size * 0.5;
			this.defaultCamera.position.z = size * 1.2;
			const center = new Vector3(size * 0.2, size * 0.4, -size * 0.5);
			this.defaultCamera.lookAt(center);
		}

		this.setCamera(DEFAULT_CAMERA);

		this.axesCamera.position.copy(this.defaultCamera.position);
		this.axesCamera.lookAt(this.axesScene.position);
		this.axesCamera.near = size / 100;
		this.axesCamera.far = size * 100;
		this.axesCamera.updateProjectionMatrix();
		this.axesCorner.scale.set(size, size, size);

		this.controls.saveState();
		this.controls.enabled = false;

		this.scene.add(object);
		this.content = object;
		this.contents.push(object);

		this.state.punctualLights = true;

		this.content.traverse((node) => {
			if (node.isLight) {
				this.state.punctualLights = false;
			}
		});

		this.setClips(clips, Lf, Rf);

		this.updateLights();
		this.updateGUI();
		this.updateEnvironment();
		this.updateDisplay();

		window.VIEWER.scene = this.content;

		this.printGraph(this.content);
	}

	printGraph(node) {
		console.group(' <' + node.type + '> ' + node.name);
		node.children.forEach((child) => this.printGraph(child));
		console.groupEnd();
	}

	/**
	 * @param {Array<THREE.AnimationClip} clips
	 */
	setClips(clips, Lf, Rf) {
		if (this.mixer) {
			this.mixer.stopAllAction();
			this.mixer.uncacheRoot(this.mixer.getRoot());
			this.mixer = null;
		}

		this.clip = AnimationUtils.subclip(clips[0], 'subClip', Lf, Rf);
		this.clips.push(this.clip);

		this.mixer = new AnimationMixer(this.content);
		this.mixer.clipAction(this.clip).reset().play();
		this.togglePlay();

		this.mixers.push(this.mixer);
	}

	// 新增动画控制方法
	togglePlay() {
		this.state.isPlaying = !this.state.isPlaying;
		// 控制播放按钮可见性
		this.playButton.innerHTML = this.state.isPlaying ? '<img src="/pause.png">' : '<img src="/play.png">';
		this.playButton.style.display = this.activated ? 'flex' : 'none';
		console.log(this.mixer);
		const action = this.mixer.clipAction(this.clip);
		action.paused = !this.state.isPlaying;
	}


	/**
	 * @param {string} name
	 */
	setCamera(name) {
		if (name === DEFAULT_CAMERA) {
			this.controls.enabled = true;
			this.activeCamera = this.defaultCamera;
		} else {
			this.controls.enabled = false;
			this.content.traverse((node) => {
				if (node.isCamera && node.name === name) {
					this.activeCamera = node;
				}
			});
		}
	}

	updateLights() {
		const state = this.state;
		const lights = this.lights;

		if (state.punctualLights && !lights.length) {
			this.addLights();
		} else if (!state.punctualLights && lights.length) {
			this.removeLights();
		}

		this.renderer.toneMapping = Number(state.toneMapping);
		this.renderer.toneMappingExposure = Math.pow(2, state.exposure);

		if (lights.length === 2) {
			lights[0].intensity = state.ambientIntensity;
			lights[0].color.set(state.ambientColor);
			lights[1].intensity = state.directIntensity;
			lights[1].color.set(state.directColor);
		}
	}

	addLights() {
		const state = this.state;

		if (this.options.preset === Preset.ASSET_GENERATOR) {
			const hemiLight = new HemisphereLight();
			hemiLight.name = 'hemi_light';
			this.scene.add(hemiLight);
			this.lights.push(hemiLight);
			return;
		}

		const light1 = new AmbientLight(state.ambientColor, state.ambientIntensity);
		light1.name = 'ambient_light';
		this.defaultCamera.add(light1);

		const light2 = new DirectionalLight(state.directColor, state.directIntensity);
		light2.position.set(0.5, 0, 0.866); // ~60º
		light2.name = 'main_light';
		this.defaultCamera.add(light2);

		this.lights.push(light1, light2);
	}

	removeLights() {
		this.lights.forEach((light) => light.parent.remove(light));
		this.lights.length = 0;
	}

	updateEnvironment() {
		const environment = environments.filter(
			(entry) => entry.name === this.state.environment,
		)[0];

		this.getCubeMapTexture(environment).then(({ envMap }) => {
			this.scene.environment = envMap;
			this.scene.background = this.state.bgColor;
		});
			
	}

	getCubeMapTexture(environment) {
		const { id, path } = environment;

		// neutral (THREE.RoomEnvironment)
		if (id === 'neutral') {
			return Promise.resolve({ envMap: this.neutralEnvironment });
		}

		// none
		if (id === '') {
			return Promise.resolve({ envMap: null });
		}

		return new Promise((resolve, reject) => {
			new EXRLoader().load(
				path,
				(texture) => {
					const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;
					this.pmremGenerator.dispose();

					resolve({ envMap });
				},
				undefined,
				reject,
			);
		});
	}

	updateDisplay() {
		if (this.skeletonHelpers.length) {
			this.skeletonHelpers.forEach((helper) => this.scene.remove(helper));
		}

		traverseMaterials(this.content, (material) => {
			material.wireframe = this.state.wireframe;

			if (material instanceof PointsMaterial) {
				material.size = this.state.pointSize;
			}
		});

		this.content.traverse((node) => {
			if (node.geometry && node.skeleton && this.state.skeleton) {
				const helper = new SkeletonHelper(node.skeleton.bones[0].parent);
				helper.material.linewidth = 3;
				this.scene.add(helper);
				this.skeletonHelpers.push(helper);
			}
		});

		if (this.state.grid !== Boolean(this.gridHelper)) {
			if (this.state.grid) {
				this.gridHelper = new GridHelper();
				this.axesHelper = new AxesHelper();
				this.axesHelper.renderOrder = 999;
				this.axesHelper.onBeforeRender = (renderer) => renderer.clearDepth();
				this.scene.add(this.gridHelper);
				this.scene.add(this.axesHelper);
			} else {
				this.scene.remove(this.gridHelper);
				this.scene.remove(this.axesHelper);
				this.gridHelper = null;
				this.axesHelper = null;
				this.axesRenderer.clear();
			}
		}

		this.controls.autoRotate = this.state.autoRotate;
	}

	updateBackground() {
		this.backgroundColor.set(this.state.bgColor);
	}

	/**
	 * Adds AxesHelper.
	 *
	 * See: https://stackoverflow.com/q/16226693/1314762
	 */
	addAxesHelper() {
		this.axesDiv = document.createElement('div');
		this.el.appendChild(this.axesDiv);
		this.axesDiv.classList.add('axes');

		const { clientWidth, clientHeight } = this.axesDiv;

		this.axesScene = new Scene();
		this.axesCamera = new PerspectiveCamera(50, clientWidth / clientHeight, 0.1, 10);
		this.axesScene.add(this.axesCamera);

		this.axesRenderer = new WebGLRenderer({ alpha: true });
		this.axesRenderer.setPixelRatio(window.devicePixelRatio);
		this.axesRenderer.setSize(this.axesDiv.clientWidth, this.axesDiv.clientHeight);

		this.axesCamera.up = this.defaultCamera.up;

		this.axesCorner = new AxesHelper(5);
		this.axesScene.add(this.axesCorner);
		this.axesDiv.appendChild(this.axesRenderer.domElement);
	}

	addGUI() {
		const gui = (this.gui = new GUI({
			autoPlace: true,
			width: 180,
			hideable: true,
		}));

		// Display controls.
		const dispFolder = gui.addFolder('Display');
		const envBackgroundCtrl = dispFolder.add(this.state, 'background');
		envBackgroundCtrl.onChange(() => this.updateEnvironment());
		const autoRotateCtrl = dispFolder.add(this.state, 'autoRotate');
		autoRotateCtrl.onChange(() => this.updateDisplay());
		const wireframeCtrl = dispFolder.add(this.state, 'wireframe');
		wireframeCtrl.onChange(() => this.updateDisplay());
		const skeletonCtrl = dispFolder.add(this.state, 'skeleton');
		skeletonCtrl.onChange(() => this.updateDisplay());
		const gridCtrl = dispFolder.add(this.state, 'grid');
		gridCtrl.onChange(() => this.updateDisplay());
		dispFolder.add(this.controls, 'screenSpacePanning');
		const pointSizeCtrl = dispFolder.add(this.state, 'pointSize', 1, 16);
		pointSizeCtrl.onChange(() => this.updateDisplay());
		const bgColorCtrl = dispFolder.addColor(this.state, 'bgColor');
		bgColorCtrl.onChange(() => this.updateBackground());

		// Lighting controls.
		const lightFolder = gui.addFolder('Lighting');
		const envMapCtrl = lightFolder.add(
			this.state,
			'environment',
			environments.map((env) => env.name),
		);
		envMapCtrl.onChange(() => this.updateEnvironment());
		[
			lightFolder.add(this.state, 'toneMapping', {
				Linear: LinearToneMapping,
				'ACES Filmic': ACESFilmicToneMapping,
			}),
			lightFolder.add(this.state, 'exposure', -10, 10, 0.01),
			lightFolder.add(this.state, 'punctualLights').listen(),
			lightFolder.add(this.state, 'ambientIntensity', 0, 2),
			lightFolder.addColor(this.state, 'ambientColor'),
			lightFolder.add(this.state, 'directIntensity', 0, 4), // TODO(#116)
			lightFolder.addColor(this.state, 'directColor'),
		].forEach((ctrl) => ctrl.onChange(() => this.updateLights()));

		// Animation controls.
		this.animFolder = gui.addFolder('Animation');
		this.animFolder.domElement.style.display = 'none';

		const playbackSpeedCtrl = this.animFolder.add(this.state, 'playbackSpeed', 0, 1);
		playbackSpeedCtrl.onChange((speed) => {
			if (this.mixer) this.mixer.timeScale = speed;
		});

		// Morph target controls.
		this.morphFolder = gui.addFolder('Morph Targets');
		this.morphFolder.domElement.style.display = 'none';

		// Camera controls.
		this.cameraFolder = gui.addFolder('Cameras');
		this.cameraFolder.domElement.style.display = 'none';

		// Stats.
		const perfFolder = gui.addFolder('Performance');
		const perfLi = document.createElement('li');
		this.stats.dom.style.position = 'static';
		perfLi.appendChild(this.stats.dom);
		perfLi.classList.add('gui-stats');
		perfFolder.__ul.appendChild(perfLi);

		const guiWrap = document.createElement('div');
		this.el.appendChild(guiWrap);
		guiWrap.classList.add('gui-wrap');
		guiWrap.appendChild(gui.domElement);
		gui.close();
	}

	updateGUI() {
		this.cameraFolder.domElement.style.display = 'none';

		this.morphCtrls.forEach((ctrl) => ctrl.remove());
		this.morphCtrls.length = 0;
		this.morphFolder.domElement.style.display = 'none';

		this.animCtrls.forEach((ctrl) => ctrl.remove());
		this.animCtrls.length = 0;
		this.animFolder.domElement.style.display = 'none';

		const cameraNames = [];
		const morphMeshes = [];
		this.content.traverse((node) => {
			if (node.geometry && node.morphTargetInfluences) {
				morphMeshes.push(node);
			}
			if (node.isCamera) {
				node.name = node.name || `VIEWER__camera_${cameraNames.length + 1}`;
				cameraNames.push(node.name);
			}
		});

		if (cameraNames.length) {
			this.cameraFolder.domElement.style.display = '';
			if (this.cameraCtrl) this.cameraCtrl.remove();
			const cameraOptions = [DEFAULT_CAMERA].concat(cameraNames);
			this.cameraCtrl = this.cameraFolder.add(this.state, 'camera', cameraOptions);
			this.cameraCtrl.onChange((name) => this.setCamera(name));
		}

		if (morphMeshes.length) {
			this.morphFolder.domElement.style.display = '';
			morphMeshes.forEach((mesh) => {
				if (mesh.morphTargetInfluences.length) {
					const nameCtrl = this.morphFolder.add(
						{ name: mesh.name || 'Untitled' },
						'name',
					);
					this.morphCtrls.push(nameCtrl);
				}
				for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
					const ctrl = this.morphFolder
						.add(mesh.morphTargetInfluences, i, 0, 1, 0.01)
						.listen();
					Object.keys(mesh.morphTargetDictionary).forEach((key) => {
						if (key && mesh.morphTargetDictionary[key] === i) ctrl.name(key);
					});
					this.morphCtrls.push(ctrl);
				}
			});
		}

	}

	clear() {
		if (!this.content) return;

		this.scene.remove(this.content);

		// dispose geometry
		this.content.traverse((node) => {
			if (!node.geometry) return;

			node.geometry.dispose();
		});

		// dispose textures
		traverseMaterials(this.content, (material) => {
			for (const key in material) {
				if (key !== 'envMap' && material[key] && material[key].isTexture) {
					material[key].dispose();
				}
			}
		});
	}
}

function traverseMaterials(object, callback) {
	object.traverse((node) => {
		if (!node.geometry) return;
		const materials = Array.isArray(node.material) ? node.material : [node.material];
		materials.forEach(callback);
	});
}