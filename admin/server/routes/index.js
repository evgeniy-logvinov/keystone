var _ = require('lodash');
var ejs = require('ejs');
var path = require('path');

var templatePath = path.resolve(__dirname, '../templates/index.html');

function getObjectContainsLists(keystoneList, userLists) {
	for (key in keystoneList) {
		if (!userLists.includes(key)) {
			delete keystoneList[key]
		}
	}

	return keystoneList
}

function getArrayContainsLists(keystoneLists, userLists) {
	return keystoneLists.filter(function (list) {
		return userLists.includes(list.key)
	})
}

async function getUserLists(user, keystone, permType) {
	let userLists = []
	const PermissionList = keystone.list(keystone.get('permission model'))

	if (user && user.role) {
		await PermissionList.model
			.find({
				role: keystone.mongoose.Types.ObjectId(user.role),
				permType: permType
			})
			.exec()
			.then(permissions => {
				permissions.forEach(function (perm) {
					userLists.push(perm.listName)
				})
			})
			.catch(err => {
				throw new Error(err)	
			})
	}

	return userLists
}

function getSections(keystoneSections, userLists) {
	let sections = []

	if (keystoneSections) {
		var deleteKeys = []
		sections = keystoneSections.map(function (section, i) {
			let userSection = {}
			let lists = getArrayContainsLists(section.lists, userLists)

			if (lists.length != 0) {
				userSection.key = section.key
				userSection.label = section.label
				userSection.lists = lists
				return userSection
			} else {
				deleteKeys.push(i)
				return section
			}
		});

		deleteKeys.forEach(function (key) {
			delete sections[key]
		})
	} else {
		throw new Error('Keystone nav.sections is undefined')	
	}

	return sections.filter(function (n) {
		return n != undefined
	})
}


function getBySection(keystoneBySection, userLists) {
	for (key in keystoneBySection) {
		if (keystoneBySection[key].lists) {
			let newBySectionLists = getArrayContainsLists(keystoneBySection[key].lists, userLists)

			if (newBySectionLists.length == 0) {
				delete keystoneBySection[key]
			} else {
				keystoneBySection[key].lists = newBySectionLists
			}
		} else {
			throw new Error('Keystone nav.by.section.lists is undefined')	
		}
	}

	return keystoneBySection
}

function getNav(keystone, userLists) {
	var newSections = []
	var byList = []
	var bySection = []
	if (keystone) {
		var nav = keystone.initNav(keystone.get('nav'))

		if (nav) {
			newSections = getSections(nav.sections, userLists)
			if (nav.by.list) {
				byList = getObjectContainsLists(nav.by.list, userLists)
			} else {
				throw new Error('Keystone nav.by.list is undefined')	
			}
			if (nav.by.section) {
				bySection = getBySection(nav.by.section, userLists)
			} else {
				throw new Error('Keystone nav.by.section is undefined')	
			}
		} else {
			throw new Error('Keystone nav is undefined')
		}
	} else {
		throw new Error('Keystone is undefined')
	}

	return {
		sections: newSections,
		by: {
			list: byList,
			section: bySection,
		},
	}
}

module.exports = async function IndexRoute(req, res) {
	var keystone = req.keystone;
	var lists = {};
	var orphanedLists = []

	if (keystone.get('permission model') && keystone.get('role model')) {
		try {
			let userLists = await getUserLists(req.user, keystone, 'delete')
			keystone.nav = getNav(keystone, userLists)
	
			_.forEach(keystone.lists, function (list, key) {
				lists[key] = list.getOptions();
			});
	
			lists = getObjectContainsLists(lists, userLists)
	
			orphanedLists = keystone.getOrphanedLists().map(function (list) {
				return _.pick(list, ['key', 'label', 'path']);
			});
	
			orphanedLists = getArrayContainsLists(orphanedLists, userLists)
		} catch (err) {
			if (err) {
				console.error('Could not render Admin UI Index Template:', err);
				return res.status(500).send(keystone.wrapHTMLError('Error Rendering Admin UI', err.message));
			}
		}
	} else {
		_.forEach(keystone.lists, function (list, key) {
			lists[key] = list.getOptions();
		});

		orphanedLists = keystone.getOrphanedLists().map(function (list) {
			return _.pick(list, ['key', 'label', 'path']);
		});
	}

	var backUrl = keystone.get('back url');
	if (backUrl === undefined) {
		// backUrl can be falsy, to disable the link altogether
		// but if it's undefined, default it to "/"
		backUrl = '/';
	}

	var UserList = keystone.list(keystone.get('user model'));

	var keystoneData = {
		adminPath: '/' + keystone.get('admin path'),
		appversion: keystone.get('appversion'),
		backUrl: backUrl,
		brand: keystone.get('brand'),
		csrf: { header: {} },
		devMode: !!process.env.KEYSTONE_DEV,
		lists: lists,
		nav: keystone.nav,
		orphanedLists: orphanedLists,
		signoutUrl: keystone.get('signout url'),
		user: {
			id: req.user.id,
			name: UserList.getDocumentName(req.user) || '(no name)',
		},
		userList: UserList.key,
		version: keystone.version,
		wysiwyg: {
			options: {
				enableImages: keystone.get('wysiwyg images') ? true : false,
				enableCloudinaryUploads: keystone.get('wysiwyg cloudinary images') ? true : false,
				enableS3Uploads: keystone.get('wysiwyg s3 images') ? true : false,
				additionalButtons: keystone.get('wysiwyg additional buttons') || '',
				additionalPlugins: keystone.get('wysiwyg additional plugins') || '',
				additionalOptions: keystone.get('wysiwyg additional options') || {},
				overrideToolbar: keystone.get('wysiwyg override toolbar'),
				skin: keystone.get('wysiwyg skin') || 'keystone',
				menubar: keystone.get('wysiwyg menubar'),
				importcss: keystone.get('wysiwyg importcss') || '',
			}
		},
	};
	keystoneData.csrf.header[keystone.security.csrf.CSRF_HEADER_KEY] = keystone.security.csrf.getToken(req, res);

	var codemirrorPath = keystone.get('codemirror url path')
		? '/' + keystone.get('codemirror url path')
		: '/' + keystone.get('admin path') + '/js/lib/codemirror';

	var locals = {
		adminPath: keystoneData.adminPath,
		cloudinaryScript: false,
		codemirrorPath: codemirrorPath,
		env: keystone.get('env'),
		fieldTypes: keystone.fieldTypes,
		ga: {
			property: keystone.get('ga property'),
			domain: keystone.get('ga domain'),
		},
		keystone: keystoneData,
		title: keystone.get('name') || 'Keystone',
	};

	var cloudinaryConfig = keystone.get('cloudinary config');
	if (cloudinaryConfig) {
		var cloudinary = require('cloudinary');
		var cloudinaryUpload = cloudinary.uploader.direct_upload();
		keystoneData.cloudinary = {
			cloud_name: keystone.get('cloudinary config').cloud_name,
			api_key: keystone.get('cloudinary config').api_key,
			timestamp: cloudinaryUpload.hidden_fields.timestamp,
			signature: cloudinaryUpload.hidden_fields.signature,
		};
		locals.cloudinaryScript = cloudinary.cloudinary_js_config();
	};

	ejs.renderFile(templatePath, locals, { delimiter: '%' }, function (err, str) {
		if (err) {
			console.error('Could not render Admin UI Index Template:', err);
			return res.status(500).send(keystone.wrapHTMLError('Error Rendering Admin UI', err.message));
		}
		res.send(str);
	});
};
