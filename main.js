/* -------------------------------
   ✅ 전역 변수 및 초기 설정
--------------------------------*/
const map = new naver.maps.Map('map', {
  center: new naver.maps.LatLng(35.144, 129.060),
  zoom: 16,
  minZoom: 7,
  maxZoom: 19
});

const addressBox = document.getElementById("addressBox");
const markers = [];
let cluster = null;
let currentEmdData = null;
let activePolygon = null;
let dataList = [];
let sigunguGeoJson = { features: [] };
const polygonCache = {};
const loadedEmdCodes = [];

let markerDataList = markerData;
let regionUpdateTimer = null;
let clusterIcons = [1, 2, 3, 4, 5].map(() => getBaseIcon(40));

/* -------------------------------
   ✅ JSON 데이터 로딩
--------------------------------*/
async function loadEmdJson(code, callback) {
  if (loadedEmdCodes.includes(code)) return callback?.();

  try {
    const res = await fetch(`./dongData/emd_${code}.json`);
    if (!res.ok) throw new Error('emd JSON load failed');
    const data = await res.json();
    currentEmdData = data;
    loadedEmdCodes.push(code);
    callback?.();
  } catch (e) {
    console.error("Failed to load emd json:", e);
  }
}

/* -------------------------------
   ✅ 지도 중심 위치로 영역 적용
--------------------------------*/
function updateRegionByCenter() {
  clearTimeout(regionUpdateTimer);
  regionUpdateTimer = setTimeout(() => {
    const center = map.getCenter();
    naver.maps.Service.reverseGeocode({
      coords: center,
      orders: [naver.maps.Service.OrderType.ADDR, naver.maps.Service.OrderType.ROAD_ADDR].join(',')
    }, (status, res) => {
      if (status !== naver.maps.Service.Status.OK) return;
      const result = res.v2.results[0];
      if (!result) return;
      const emdCode = result.code.id.slice(0, 2);
      loadEmdJson(emdCode, () => applyRegionUpdate());
    });
  }, 300);
}

function applyRegionUpdate() {
  const zoom = map.getZoom();
  if (zoom > 14) dataList = currentEmdData?.features || [];
  else if (zoom > 11) dataList = sigunguGeoJson.features;
  else dataList = [];
  const filtered = (zoom > 14 && currentEmdData) ? filterMarkersByEmdPolygon() : markerDataList;
  renderMarkers(filtered);
  renderRegionAtCenter(map.getCenter());
}

/* -------------------------------
   ✅ 마커 및 클러스터 처리
--------------------------------*/
function clearMarkers() {
  markers.forEach(m => m.setMap(null));
  markers.length = 0;
}

function renderMarkers(list) {
  clearMarkers();
  list.forEach(({ lat, lng, type, name, price, count, active }) => {
    const position = new naver.maps.LatLng(lat, lng);
    const iconHTML = `<div class="marker">
      <img src="./image/type${type}.png"/>
      ${count ? `<div class="count ${active ? '' : 'deActive'}">${count}</div>` : ''}
      <div class="textBox"><p>${name || '건물명 없음'}</p><p>${active ? `${(price / 1e8).toFixed(2)}억원` : ''}</p></div>
    </div>`;

    const marker = new naver.maps.Marker({
      position,
      icon: { content: iconHTML, size: new naver.maps.Size(30, 30), scaledSize: new naver.maps.Size(30, 30) }
    });

    marker.addListener("click", () => {
      const infoBox = document.querySelector(".infoBox");
      const sorted = [...complexList].sort((a, b) => b.popularity - a.popularity);
      infoBox.querySelector(".count").innerText = sorted.length;
      setInfoContent(sorted);
      infoBox.classList.add("show");
    });

    markers.push(marker);
  });
}

function updateMarkersByPolygon() {
  if (!activePolygon) return cluster?.setMap(null);

  const mapBounds = map.getBounds();
  const paths = activePolygon.getPaths().getArray().map(p => p.getArray());

  const visible = markers.filter(m => mapBounds.hasLatLng(m.getPosition()) && isPointInsidePolygon(m.getPosition(), paths));
  cluster?.setMap(null);
  cluster = new MarkerClustering({
    map,
    markers: visible,
    disableClickZoom: false,
    gridSize: 300,
    minClusterSize: 1,
    maxZoom: 18,
    icons: clusterIcons,
    indexGenerator: [10, 100, 200, 500, 1000],
    stylingFunction: (c, count) => c.getElement().querySelector('div:first-child').innerText = count
  });
}

function updateClusterIconsByZoom() {
  const zoom = map.getZoom(), delta = 16 - zoom;
  const size = delta > 0 ? 50 + delta * 10 : 50;
  clusterIcons = [1, 2, 3, 4, 5].map(() => getBaseIcon(size));
  cluster && updateMarkersByPolygon();
}

/* -------------------------------
   ✅ 기타 함수
--------------------------------*/
function getBaseIcon(size) {
  return {
    content: `<div style="cursor:pointer;width:${size}px;height:${size}px;line-height:${size + 2}px;font-size:${Math.max(12, size / 3)}px;color:white;text-align:center;font-weight:bold;background:url(./image/baseIcon.png);background-size:contain;"></div>`,
    size: new naver.maps.Size(size, size),
    anchor: new naver.maps.Point(size / 2, size / 2)
  };
}

function renderRegionAtCenter(center) {
  activePolygon?.setMap(null);
  activePolygon = null;
  for (const feature of dataList) {
    const polygon = createPolygon(feature);
    const paths = polygon.getPaths().getArray().map(p => p.getArray());
    if (isPointInsidePolygon(center, paths)) {
      polygon.setMap(map);
      activePolygon = polygon;
      break;
    }
  }
  updateMarkersByPolygon();
}

function isPointInsidePolygon(pos, paths) {
  const x = pos.lng(), y = pos.lat();
  let inside = false;
  paths.forEach(path => {
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const xi = path[i].lng(), yi = path[i].lat(), xj = path[j].lng(), yj = path[j].lat();
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-10) + xi);
      if (intersect) inside = !inside;
    }
  });
  return inside;
}

function createPolygon(feature) {
  const key = feature.properties.EMD_CD || JSON.stringify(feature.geometry);
  if (polygonCache[key]) return polygonCache[key];

  const paths = [];
  const coords = feature.geometry.coordinates;
  if (feature.geometry.type === "Polygon") {
    coords.forEach(ring => paths.push(ring.map(([lng, lat]) => new naver.maps.LatLng(lat, lng))));
  } else {
    coords.forEach(poly => poly.forEach(ring => paths.push(ring.map(([lng, lat]) => new naver.maps.LatLng(lat, lng)))));
  }

  const polygon = new naver.maps.Polygon({
    paths,
    fillColor: '#FE7E33',
    fillOpacity: 0.1,
    strokeColor: '#FE7E33',
    strokeOpacity: 1,
    strokeWeight: 2,
    clickable: false
  });
  polygon.bounds = getPathsBounds(paths);
  polygonCache[key] = polygon;
  return polygon;
}

function getPathsBounds(paths) {
  const bounds = new naver.maps.LatLngBounds();
  paths.forEach(path => path.forEach(p => bounds.extend(p)));
  return bounds;
}

function filterMarkersByEmdPolygon() {
  if (!currentEmdData?.features) return [];
  const mapBounds = map.getBounds();
  const visible = markerDataList.filter(m => mapBounds.hasLatLng(new naver.maps.LatLng(m.lat, m.lng)));
  const polygons = currentEmdData.features.map(f => createPolygon(f).getPaths().getArray().map(p => p.getArray()));
  return visible.filter(m => polygons.some(p => isPointInsidePolygon(new naver.maps.LatLng(m.lat, m.lng), p)));
}

/* -------------------------------
   ✅ 이벤트 바인딩
--------------------------------*/
naver.maps.Event.addListener(map, 'idle', updateRegionByCenter);
naver.maps.Event.addListener(map, 'zoom_changed', () => {
  updateClusterIconsByZoom();
  updateRegionByCenter();
});

window.addEventListener("load", () => {
  updateRegionByCenter();
});
