const {homedir} = require('os');
const {resolve} = require('path');
const {exec} = require('child_process');
const fs = require('fs');
const extend = require('extend');
const {argv} = require('yargs');
const {app, dialog, shell, Menu, Tray} = require('electron'); // eslint-disable-line import/no-extraneous-dependencies

// Our modules
const jupyter = require('./jupyter');

// Load config
const userConfigPath = resolve(homedir(), '.junorc.json');
const defaultConfig = {
	jupyterCommand: resolve(homedir(), '.pyenv', 'shims', 'jupyter-notebook'),
	jupyterPort: 8888,
	openBrowserOnStartup: true
};
let globalConfig;
try {
	const userConfig = require(userConfigPath);
	globalConfig = extend(defaultConfig, userConfig);
} catch (err) {
	fs.writeFileSync(userConfigPath, JSON.stringify(defaultConfig, null, '  '), 'utf-8');
	globalConfig = defaultConfig;
}

// Global instances
let tray = null;
let jupyterPID = null;
let notebooksToOpen = [];

// Supress multiple instances
const shouldQuit = app.makeSingleInstance(argv => {
	const notebooks = argv.slice(2);
	jupyter.openBrowser(notebooks, globalConfig.jupyterPort);
});

// Quit if the app instance is secondary one
if (shouldQuit) {
	app.quit();
	return;
}

// Open browser and show notebooks
function openBrowser(notebooks) {
	jupyter.openBrowser(notebooks, globalConfig.jupyterPort);
}

// Open browser when files are passed
app.on('open-file', (event, path) => {
	event.preventDefault();
	if (jupyterPID) {
		openBrowser([path]);
	} else {
		notebooksToOpen.push(path);
	}
});

// Kill jupyter daemon when quitting
app.on('before-quit', () => {
	process.kill(jupyterPID, 'SIGHUP');
});

// Initialize app
app.on('ready', () => {
	// Hide dock icon
	if (app.dock) {
		app.dock.hide();
	}

	// Setup macOS tray menu
	tray = new Tray(`${__dirname}/assets/tray@2x.png`);
	const contextMenu = Menu.buildFromTemplate([
		{label: 'Running on localhost:' + globalConfig.jupyterPort, enabled: false},
		{
			type: 'separator'
		},
		{label: 'Open Jupyter Notebook', accelerator: 'Command+O', click: () => {
			openBrowser([]);
		}},
		{
			type: 'separator'
		},
		{label: 'New Notebook', accelerator: 'Command+N', click: () => {
			dialog.showSaveDialog({
				title: 'New Notebook',
				defaultPath: resolve(homedir(), 'Untitled.ipynb')
			}, filepath => {
				const defaultNotebook = {
					cells: [],
					metadata: {},
					nbformat: 4,
					nbformat_minor: 0 // eslint-disable-line camelcase
				};
				fs.writeFileSync(filepath, JSON.stringify(defaultNotebook, null, '  '));
				openBrowser([filepath]);
			});
		}},
		{label: 'Preferences...', accelerator: 'Command+,', click: () => {
			exec(`open ${userConfigPath}`);
		}},
		{
			type: 'separator'
		},
		{label: 'Open Documentation', click: () => {
			shell.openExternal('https://github.com/uetchy/juno');
		}},
		{label: 'Send Feedback', click: () => {
			shell.openExternal('https://github.com/uetchy/juno/issues/new');
		}},
		{
			type: 'separator'
		},
    {label: 'Quit Juno', role: 'quit', accelerator: 'Command+Q'}
	]);
	tray.setToolTip('Juno is enabled');
	tray.setContextMenu(contextMenu);

	// Gather notebooks
	const notebooks = notebooksToOpen.concat(argv._);
	notebooksToOpen = [];

  // Launch or pick up jupyter daemon and get PID
	jupyterPID = jupyter.getJupyterProcess(globalConfig.jupyterCommand, globalConfig.jupyterPort);
	if (notebooks.length > 0 || globalConfig.openBrowserOnStartup) {
		openBrowser(notebooks);
	}
});