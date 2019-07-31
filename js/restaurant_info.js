let restaurant;
var newMap;
var mapLoaded = false;
/**
 * Initialize map as soon as the page is loaded.
 */
document.addEventListener('DOMContentLoaded', (event) => {  
  if (!mapLoaded){
    mapLoaded = true
    initMap();
  }
});

/**
 * Initialize leaflet map
 */
initMap = () => {
  fetchRestaurantFromURL((error, restaurant) => {
    if (error) { // Got an error!
      console.log(error);
    } else {      
      self.newMap = L.map('map', {
        center: [restaurant.latlng.lat, restaurant.latlng.lng],
        zoom: 16,
        scrollWheelZoom: false
      });
      L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.jpg70?access_token={mapboxToken}', {
        mapboxToken: 'pk.eyJ1Ijoia2hhbGVkYWxpc3NhIiwiYSI6ImNqeDZvZ2prYzAxcHM0MWp1ZmNjMDR3eXAifQ.6YC9ectg8vKy5EGD4-eCeg',
        maxZoom: 18,
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' +
          '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
          'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        id: 'mapbox.streets'    
      }).addTo(newMap);
      fillBreadcrumb();
      DBHelper.mapMarkerForRestaurant(self.restaurant, self.newMap);
    }
  });
}  
 

/**
 * Get current restaurant from page URL.
 */
fetchRestaurantFromURL = (callback) => {
  if (self.restaurant) { // restaurant already fetched!
    callback(null, self.restaurant)
    return;
  }
  const id = getParameterByName('id');
  if (!id) { // no id found in URL
    error = 'No restaurant id in URL'
    callback(error, null);
  } else {
    DBHelper.fetchRestaurantById(id, (error, restaurant) => {
      self.restaurant = restaurant;
      if (!restaurant) {
        console.error(error);
        return;
      }
      fillRestaurantHTML();
      callback(null, restaurant)
    });
  }
}

/**
 * Create restaurant HTML and add it to the webpage
 */
fillRestaurantHTML = (restaurant = self.restaurant) => {
  const name = document.getElementById('restaurant-name');
  name.innerHTML = restaurant.name;

  const address = document.getElementById('restaurant-address');
  address.innerHTML = restaurant.address;

  const image = document.getElementById('restaurant-img');

  image.className = 'restaurant-img'
  image.src = DBHelper.imageUrlForRestaurant(restaurant);
  image.alt = 'image for '+ restaurant.name;


  const cuisine = document.getElementById('restaurant-cuisine');
  cuisine.innerHTML = restaurant.cuisine_type;


  const favoriteButton = document.getElementById('favorite-button');
  let innerText;

  if (restaurant['is_favorite'] == 'true')
    innerText = 'Unfavorite';
  else
    innerText = 'Favorite';

  favoriteButton.innerHTML = innerText;



  // fill operating hours
  if (restaurant.operating_hours) {
    fillRestaurantHoursHTML();
  }
  // fill reviews
  fillReviewsHTML();
}

/**
 * Create restaurant operating hours HTML table and add it to the webpage.
 */
fillRestaurantHoursHTML = (operatingHours = self.restaurant.operating_hours) => {
  const hours = document.getElementById('restaurant-hours');
  for (let key in operatingHours) {
    const row = document.createElement('tr');

    const day = document.createElement('td');
    day.innerHTML = key;
    row.appendChild(day);

    const time = document.createElement('td');
    time.innerHTML = operatingHours[key];
    row.appendChild(time);

    hours.appendChild(row);
  }
}

/**
 * Create all reviews HTML and add them to the webpage.
 */
fillReviewsHTML = (reviews = self.restaurant.reviews) => {
  console.log(reviews);
  
  const container = document.getElementById('reviews-container');
  container.innerHTML = '';

  const title = document.createElement('h2');
  title.innerHTML = 'Reviews';
  container.appendChild(title);


  if (!reviews) {
    const noReviews = document.createElement('p');
    noReviews.innerHTML = 'No reviews yet!';
    container.appendChild(noReviews);
    return;
  }
  const ul = document.createElement('ul')
  ul.id = 'reviews-list';
  reviews.forEach(review => {
    ul.appendChild(createReviewHTML(review));
  });
  container.appendChild(ul);
}

/**
 * Create review HTML and add it to the webpage.
 */
createReviewHTML = (review) => {
  const li = document.createElement('li');
  const name = document.createElement('p');

  name.innerHTML = review.name;
  li.appendChild(name);

  // const date = document.createElement('p');
  // date.innerHTML = review.date;
  // li.appendChild(date);

  const rating = document.createElement('p');
  rating.innerHTML = `Rating: ${review.rating}`;
  li.appendChild(rating);

  const comments = document.createElement('p');
  comments.innerHTML = review.comments;
  li.appendChild(comments);

  // const delete_link = document.createElement('a');
  // delete_link.onclick = function(){
  //   event.preventDefault(); 
  //   deleteReview(review.id);
  // }
  // delete_link.href=""
  // delete_link.innerHTML = "Delete";
  // li.appendChild(delete_link);

  if(review['is_deferred'] == 'true'){
    const deferred_message = document.createElement('p');
    deferred_message.style = "color: red;"
    deferred_message.innerHTML = "This review is deferred."
    li.appendChild(deferred_message)    
  }


  return li;
}

/**
 * Add restaurant name to the breadcrumb navigation menu
 */
fillBreadcrumb = (restaurant=self.restaurant) => {
  const breadcrumb = document.getElementById('breadcrumb');
  const li = document.createElement('li');
  li.innerHTML = restaurant.name;
  breadcrumb.appendChild(li);
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




submitReview = () => {
    const form =  document.getElementById('review-form')
    const id = getParameterByName('id');

    const data = {
      'restaurant_id': Number(id),
      'name': form.elements['name'].value,
      'rating': form.elements['rating'].value,
      'comments': form.elements['comments'].value
    }

    console.log('submitting review: ' + JSON.stringify(data))

      DBHelper.submitReview(data, function(success, error){
      if (success){
        location.reload(true)
      }
      else{
        console.log('review failed: '+ error)
      }
      });
}
















deleteReview = (id) => {
  // to be implemented
  DBHelper.deleteReview(id, (success, error) => {
    if (success)
      location.reload(true)
    else
      console.log('review not deleted');
  })
}


toggleFavorite = () => {

  const id = getParameterByName('id');
  let next_state;

  if (self.restaurant['is_favorite'] == 'true')
    next_state = false
  else
    next_state = true

  DBHelper.setFavorite(id, next_state, (success, error) => {
    if (success)
      location.reload(true) 
    else
      console.log('action not submitted')
    })
}



addReview = (review) => {
  const ul = document.getElementById('reviews-list');
  ul.appendChild(createReviewHTML(review));
}


const channel = new BroadcastChannel('sw-messages');

channel.onmessage = event => {
  console.log('adding deferred review');
  if (event.data.action = 'add-review'){
    addReview(event.data.review);
  }
}


if ('serviceWorker' in navigator ) {
  navigator.serviceWorker.register('/sw.js');
}



if ('serviceWorker' in navigator && 'SyncManager' in window) {
  navigator.serviceWorker.ready.then(function(reg) {
    return reg.sync.register('sync-reviews');
  }).catch(function() {
    navigator.serviceWorker.controller.postMessage('sync-reviews');
  });
} else {
  navigator.serviceWorker.controller.postMessage('sync-reviews');
}









