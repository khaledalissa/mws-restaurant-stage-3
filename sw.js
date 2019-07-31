importScripts('js/idb.js');

cacheName = 'static-v1'
imagesCache = 'images-cache'
var allCaches = [cacheName, imagesCache]

self.addEventListener('sync', function(event) {
	console.log('sync API activated')
  if (event.tag == 'sync-reviews') {
    event.waitUntil(syncReviews());
  }
});


self.addEventListener('message', function(event){
	console.log('forced sync')
	if (event.data == 'sync-reviews'){
		syncReviews();
	}
});


const dbPromise = idb.openDB('restaurants_db', 5, {
  upgrade(db, oldVersion, newVersion, transaction) {
	  	console.log('upgrade db');
	    var keyValStore = db.createObjectStore('restaurants',{
	    	keyPath: 'id'
	    });
	    var reviewsStore = db.createObjectStore('reviews', {
	    	keyPath: 'id',
	    	autoIncrement: true
	    });

	    reviewsStore.createIndex('restaurant_id', 'restaurant_id')
	    reviewsStore.createIndex('is_deferred', 'is_deferred')
  },
  blocked() {
	console.log('This version is blocked by another version');
  },
  blocking() {
    console.log('This version is blocking a newer version from being deployed.');
  }
});


self.addEventListener('install', function(event){
	console.log('installing');
	// open a cache and save all files
	event.waitUntil(
		caches.open(cacheName).then(function(cache){
			return cache.addAll([
					'https://unpkg.com/leaflet@1.3.1/dist/leaflet.css',
					'https://unpkg.com/leaflet@1.3.1/dist/leaflet.js',
					'/',
					'/restaurant.html',
					'css/styles.css',
					'js/dbhelper_api.js',
					'js/main.js',
					'js/restaurant_info.js',
					'js/idb.js',
					'/manifest.json',
					'/icon.png'
					// 'data/restaurants.json',
				]
			);
		})
	);
});


self.addEventListener('activate', function(event) {
	console.log('activating');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(cacheName) {
          return !allCaches.includes(cacheName);
        }).map(function(cacheName) {
          return caches.delete(cacheName);
        })
      );
    })
  );
});



self.addEventListener('fetch', function(event){
	var requestUrl = new URL(event.request.url);
	

	if (requestUrl.pathname.startsWith('/reviews')){
		if(event.request.method == 'GET')
			event.respondWith(serveReviews(event.request))
		else if (event.request.method == 'POST')
			event.respondWith(postReview(event.request))
	}
	else if(requestUrl.pathname == '/restaurants'){
		event.respondWith(serveJSONData(event.request));
	}
	else  if (requestUrl.pathname.startsWith('/img/')) {
      event.respondWith(servePhoto(event.request));
    } else{
		event.respondWith(serveWebsite(event.request));	
	}
	
	return;
});


function serveWebsite(request){
	return caches.match(request).then(function(response){
		return response || fetch(request);
	})
}

	

function servePhoto(request) {
  var storageUrl = request.url.replace(/-\d+px\.jpg$/, '');

  return caches.open('images-cache').then(function(cache) {
    return cache.match(storageUrl).then(function(response) {
      if (response) return response;

      return fetch(request).then(function(networkResponse) {
        cache.put(storageUrl, networkResponse.clone());
        return networkResponse;
      });
    });
  });
}


function fetchAndStoreRestaurants(response){
	response.json().then(function(restaurants){
		dbPromise.then(function(db){
			var tx = db.transaction('restaurants', 'readwrite');
			var store = tx.objectStore('restaurants');			

			restaurants.forEach(function(restaurant){
				store.put(restaurant);
			});
		});

		return;
	}).catch(function(error){
		console.warn('error @ fetchAndStoreRestaurants due to:', error);
	});
}



/*
	This method fetches response and saves its data into indexDB
	
*/
function fetchAndStoreReviews(response){
	response.json().then(function(reviews){

		dbPromise.then(function(db){
			var tx = db.transaction('reviews', 'readwrite');
			var store = tx.objectStore('reviews');			

			reviews.forEach(function(review){
				review['is_deferred'] = 'false'
				store.put(review);
			});
		});

		return;
	}).catch(function(error){
		console.warn('error @ fetchAndStoreReviews due to:', error);
	});
}


/*
	serve restaurants data from network if online, or serve from DB if offline.
*/
function serveJSONData(request){
	return fetch(request).then(function(response){
		if(!response.ok){
			console.log('response not ok, constructing offline response');
			return response;
		}
		else{
			fetchAndStoreRestaurants(response.clone());
			return response;			
		}
	}).catch(function(error){
		console.warn('fetch failed:', error);
	

		return dbPromise.then(function(db){	
			var tx = db.transaction('restaurants');
			var store = tx.objectStore('restaurants');

			return store.getAll().then(function(data){
				return new Response(JSON.stringify(data), headers());
			});
		});		


	});
}	


/*
	serve reviews data from network if online, or serve from DB if offline.
*/
function serveReviews(request){
	const id = Number(getParameterByName('restaurant_id', request.url))


	return fetch(request).then(function(response){
		if(!response.ok){
			console.log('response not ok, constructing offline response');
			return response;
		}
		else{
			fetchAndStoreReviews(response.clone());
			return response;			
		}
	}).catch(function(error){
		console.warn('fetch failed:', error);
	

		return dbPromise.then(function(db){	
			var tx = db.transaction('reviews');
			var store = tx.objectStore('reviews').index('restaurant_id');


			return store.getAll(id).then(function(data){
				return new Response(JSON.stringify(data), headers());
			});
		});		
	});
}


/*
	Post review if online, or store it in indexDB with flag is_deferred = 'true'
*/
function postReview(request){
	return request.clone().json().then(function(data){
		var review = data;
		return fetch(request.clone()).then(function(response){
			return response;
		}).catch(function(error){
			dbPromise.then(function(db){	
				var tx = db.transaction('reviews', 'readwrite');
				var store = tx.objectStore('reviews');

				review['is_deferred'] = 'true'
				store.add(review)
			});

			return new Response(JSON.stringify(review), headers())
		});

	});
}




/*sync deferred reviews */
function syncReviews(){
	const channel = new BroadcastChannel('sw-messages');

	dbPromise.then(function(db){
		var store = db.transaction('reviews', 'readwrite').objectStore('reviews');
		index = store.index('is_deferred');
		index.getAll('true').then(function(reviews){
			// console.log(reviews);
			reviews.forEach(function(review){
				deferredReview = review
				deferredId = review.id
				// delete deferredReview['id'];
				delete deferredReview['is_deferred'];

				submitReview(deferredReview, function(success, data, error){
					if(success){
						var savedReview = data;
						savedReview['is_deferred'] = 'false';

						// console.log('saving the following message:');
						// console.log(savedReview);
						
						// save to IndexDB
						db.transaction('reviews', 'readwrite').objectStore('reviews').put(savedReview);

						// the savedReview should be rendered on screen
						channel.postMessage({action: 'add-review', review: savedReview});

					}
				});
			})
		})
	});

	return Promise.resolve();	
}


/*
	submit review to DB
*/
function submitReview(data, callback){
  const url = 'http://localhost:1337/reviews/';

  fetch(url, {
    method: 'POST',
    mode: 'cors', // no-cors
    headers: { 'Content-Type': 'application/json'},    
    body: JSON.stringify(data)
  }).then(response => {
    if (response.ok){
    	response.json().then(data => callback(true, data, null))
    }
    else{
    	callback(false, null, null)
    }
  }).catch(error => {
  	callback(false, error)
  });

}




/**
 * Get a parameter by name from page URL.
 */
getParameterByName = (name, url) => {
  if (!url)
    url = window.location.href;
  name = name.replace(/[\[\]]/g, '\\$&');
  const regex = new RegExp(`[?&]${name}(=([^&#]*)|&|#|$)`),
    results = regex.exec(url);
  if (!results)
    return null;
  if (!results[2])
    return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}



function headers(data){
	var init = {
	    status: 200,
	    statusText: 'OK',
	    headers: {}
	};

	init.headers['Content-Type'] = 'text/json';

	return init;
}

function getDataFromDB(){
	return dbPromise.then(function(db){	
		var tx = db.transaction('restaurants');
		var store = tx.objectStore('restaurants');

		return store.getAll().then(function(data){
			return data;
		});		
	})
}
