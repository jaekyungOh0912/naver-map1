/* -------------------------------
     ✅ 전역 변수 및 초기 설정
  --------------------------------*/
let markerDataList = markerData;       // 기본 마커 데이터
const map = new naver.maps.Map('map', { // 지도 초기화
  center: new naver.maps.LatLng(35.144, 129.060),
  zoom: 16, minZoom:7, maxZoom:19
});
const addressBox = document.getElementById("addressBox");

const loadedEmdCodes = [];    // 이미 로드된 행정동 코드
const polygonCache = {};      // 폴리곤 캐싱
let sigunguGeoJson = null;
let cluster = null;           // 마커 클러스터
let activePolygon = null;     // 현재 활성화된 폴리곤
let dataList = [];            // 현재 지도에 표시할 데이터
let currentEmdData = null;    // 현재 행정동 데이터
const markers = [];           // 지도에 표시된 마커 목록

/* -------------------------------
   ✅ 동적 스크립트 로딩 (행정동 데이터)
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
   ✅ 주소 변환 및 검색
--------------------------------*/
// 현재 중심 좌표의 주소 갱신
function updateAddress(lat, lng) {
  naver.maps.Service.reverseGeocode({
    coords: new naver.maps.LatLng(lat, lng),
    orders: [naver.maps.Service.OrderType.ROAD_ADDR, naver.maps.Service.OrderType.ADDR].join(',')
  }, (status, response) => {
    if (status !== naver.maps.Service.Status.OK) {
      addressBox.innerText = "주소를 가져올 수 없습니다."; return;
    }
    const result = response.v2.address;
    addressBox.innerText = "📍 " + (result.roadAddress || result.jibunAddress || "주소 없음");
  });
}

// 주소 검색
function searchAddress() {
  const query = document.getElementById("searchInput").value.trim();
  if (!query) return alert("주소를 입력하세요.");

  const cleanQuery = query.replace(/[^가-힣0-9a-zA-Z\s]/g, "").trim();
  naver.maps.Service.geocode({ query: cleanQuery }, (status, response) => {
    if (status !== naver.maps.Service.Status.OK) return alert("검색 결과가 없습니다.");

    const resultList = response.v2.addresses;
    const resultBox = document.getElementById("searchResults");
    resultBox.innerHTML = "";

    if (!resultList.length) {
      resultBox.innerHTML = "<li style='padding:4px 6px;'>검색 결과가 없습니다.</li>"; return;
    }

    resultList.forEach(addr => {
      const fullAddr = addr.roadAddress || addr.jibunAddress || "(주소 없음)";
      if (!fullAddr.includes(query) && !fullAddr.replace(/\s/g, "").includes(query.replace(/\s/g, ""))) return;

      // 검색 결과 클릭 시 지도 이동
      const li = document.createElement("li");
      li.innerText = fullAddr;
      li.addEventListener("click", () => {
        const x = parseFloat(addr.x), y = parseFloat(addr.y);
        const newCenter = new naver.maps.LatLng(y, x);
        map.setCenter(newCenter); map.setZoom(16);
        new naver.maps.Marker({ position: newCenter, map: map });
        updateAddress(y, x);
        resultBox.innerHTML = "";
        document.getElementById("searchInput").value = "";
      });
      resultBox.appendChild(li);
    });
  });
}

/* -------------------------------
   ✅ 지도 중심 변경 시 업데이트 (Debounce)
--------------------------------*/
let regionUpdateTimer=null;
async function applyRegionUpdate(){
  const zoom = map.getZoom();
  if (zoom > 14 && !currentEmdData) return; // 데이터가 없으면 중단
  else if (zoom > 11 && !sigunguGeoJson) {
    const res = await fetch("./sigunguData.json");
    if (!res.ok) throw new Error("sigungu load failed");
    sigunguGeoJson = await res.json();
    console.log(sigunguGeoJson);
    /*try {
      const res = await fetch("./sigunguData.json");
      if (!res.ok) throw new Error("sigungu load failed");
      sigunguGeoJson = await res.json();
    } catch (e) {
      console.error("시군구 JSON 로드 실패:", e);
    }*/
  }

  dataList = (zoom > 14 && currentEmdData) ? currentEmdData.features : (zoom > 11 && sigunguGeoJson) ? sigunguGeoJson.features : [];

  const filteredMarkers = (zoom > 14 && currentEmdData) ? filterMarkersByEmdPolygon() : markerDataList;
  renderMarkers(filteredMarkers);
  renderRegionAtCenter(map.getCenter());
}

function updateRegionByCenter(){
  clearTimeout(regionUpdateTimer);
  regionUpdateTimer = setTimeout(()=>{
    const center=map.getCenter();
    naver.maps.Service.reverseGeocode({
      coords:center,
      orders:[naver.maps.Service.OrderType.ADDR,naver.maps.Service.OrderType.ROAD_ADDR].join(',')
    }, async (status,response)=>{
      if(status!==naver.maps.Service.Status.OK)return;
      const result=response.v2.results[0]; if(!result)return;
      const emdCode=result.code.id.slice(0,2);
      await loadEmdJson(emdCode, ()=>applyRegionUpdate(emdCode));
    });
  },300);
}


/* -------------------------------
   ✅ 마커 관련
--------------------------------*/
const infoWindow = new naver.maps.InfoWindow({
  borderWidth:0, disableAnchor:true, backgroundColor:"transparent",
  pixelOffset:new naver.maps.Point(0,-10)
});

// 마커 생성
function setMarkers(lat,lng,type,name,price,count,active){
  const priceText = price / 100000000;

  const countHTML = (count && count>0) ? `<div class="count ${active ? '' : 'deActive'}">${count}</div>` : "";
  const textHTML = `<div class="textBox"><p>${name}</p><p>${active ? `${priceText.toFixed(2)}억원` : ""}</p></div>`
  const markerHTML = `<div class="marker"><img src="./image/type${type}.png""/>${countHTML}${textHTML}</div>`;

  const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(lat,lng),
    icon:{content:markerHTML,size:new naver.maps.Size(30,30),scaledSize:new naver.maps.Size(30,30)}
  });
  // 마커 클릭 시 InfoWindow 표시
  naver.maps.Event.addListener(marker,"click",()=>{
    const infoBox = document.querySelector(".infoBox");
    const sortedData = [...complexList].sort((a, b) => b.popularity - a.popularity);

    infoBox.querySelector(".count").innerText = sortedData.length;
    setInfoContent(sortedData);
    infoBox.classList.add("show");
  });

  naver.maps.Event.addListener(map,"click",()=>infoWindow.close());
  markers.push(marker);
}

function setInfoContent(sortedData) {
  const infoBody = document.querySelector(".infoBody");
  infoBody.innerHTML = "";

  sortedData.forEach(value => {
    const box = document.createElement("div");
    box.className = "infoContentBox";

    box.innerHTML = `
        <p>${value.name}</p>
        <p>${value.price}</p>
        <p>${value.info}</p>
        <p>${value.size}</p>
      `;

    infoBody.appendChild(box);
  });
}

function clearMarkers(){ markers.forEach(m=>m.setMap(null)); markers.length=0; }
function renderMarkers(list){ clearMarkers(); list.forEach(v=>setMarkers(v.lat,v.lng,v.type,v.name||"건물명 없음",v.price||0,v.count,v.active)); }

// infoBox 외부 클릭 시 .show 제거
document.addEventListener("click", (e) => {
  const infoBox = document.querySelector(".infoBox");

  if (!infoBox) return;

  // infoBox 내부를 클릭한 경우 무시
  if (infoBox.contains(e.target)) return;

  // 마커를 클릭할 경우 무시
  if (e.target.closest(".marker")) return;

  // 그 외 영역 클릭 시 .show 제거
  infoBox.classList.remove("show");
});

// 정보 박스 순서 정렬(정렬기능은 아직 미정)
const handelSortFilter = (e, type) => {
  const sortFilter = document.querySelectorAll(".infoHead li");
  sortFilter.forEach((element) => {
    element.classList.remove("active");
  });

  const sortedData = [...complexList];

  switch (type) {
    case 1: // 인기순
      sortedData.sort((a, b) => b.popularity - a.popularity);
      break;
    case 2: // 이름 가나다순 (localeCompare로 한글 지원)
      sortedData.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      break;
    case 3: // 세대수순
      sortedData.sort((a, b) => b.household_count - a.household_count);
      break;
    case 4: // 최근입주순
      sortedData.sort((a, b) => new Date(b.move_in_date) - new Date(a.move_in_date));
      break;
    case 5: // 매물수순
      sortedData.sort((a, b) => b.sale_count - a.sale_count);
      break;
    default:
      sortedData.sort((a, b) => b.popularity - a.popularity);
  }

  console.log(sortedData);
  setInfoContent(sortedData);
  e.target.classList.add("active");
}

/* -------------------------------
   ✅ 폴리곤 및 클러스터
--------------------------------*/
function createPolygon(feature){
  const key = feature.properties.EMD_CD || JSON.stringify(feature.geometry);
  if (polygonCache[key]) return polygonCache[key];

  const paths = [];
  if(feature.geometry.type==="Polygon"){
    feature.geometry.coordinates.forEach(ring=>paths.push(ring.map(([lng,lat])=>new naver.maps.LatLng(lat,lng))));
  } else {
    feature.geometry.coordinates.forEach(poly=>poly.forEach(ring=>paths.push(ring.map(([lng,lat])=>new naver.maps.LatLng(lat,lng)))));
  }

  const polygon = new naver.maps.Polygon({
    paths,
    fillColor:'#FE7E33',
    fillOpacity:0.1,
    strokeColor:'#FE7E33',
    strokeOpacity:1,
    strokeWeight:2,
    clickable:false
  });
  polygon.bounds = getPathsBounds(paths);
  polygonCache[key] = polygon;
  return polygon;
}

function getPathsBounds(paths){
  const bounds = new naver.maps.LatLngBounds();
  paths.forEach(path => path.forEach(p => bounds.extend(p)));
  return bounds;
}

function isPointInsidePolygon(point,paths){
  const x=point.lng(),y=point.lat(); let inside=false;
  paths.forEach(path=>{
    for(let i=0,j=path.length-1;i<path.length;j=i++){
      const xi=path[i].lng(),yi=path[i].lat(),xj=path[j].lng(),yj=path[j].lat();
      const intersect=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-10)+xi);
      if(intersect) inside=!inside;
    }
  });
  return inside;
}

function filterMarkersByEmdPolygon() {
  if (!currentEmdData || !currentEmdData.features) return [];

  const mapBounds = map.getBounds();

  // 먼저 지도 영역 안에 있는 마커만 필터링
  const visibleMarkers = markerDataList.filter(m => {
    const pos = new naver.maps.LatLng(m.lat, m.lng);
    return mapBounds.hasLatLng(pos);
  });

  // 폴리곤 리스트 준비
  const polygons = currentEmdData.features.map(f => {
    const polygon = createPolygon(f);
    return polygon.getPaths().getArray().map(path => path.getArray());
  });

  // 지도 안에 있는 마커 중 폴리곤 내부에 있는 것만 필터링
  return visibleMarkers.filter(m => {
    const markerPos = new naver.maps.LatLng(m.lat, m.lng);
    return polygons.some(p => isPointInsidePolygon(markerPos, p));
  });
}

function renderRegionAtCenter(center){
  if(activePolygon) activePolygon.setMap(null);
  activePolygon = null;
  for(const feature of dataList){
    const polygon=createPolygon(feature);
    const paths=polygon.getPaths().getArray().map(path=>path.getArray());
    if(isPointInsidePolygon(center,paths)){
      polygon.setMap(map); activePolygon=polygon; break;
    }
  }
  updateMarkersByPolygon();
}

function updateMarkersByPolygon() {
  if (!activePolygon) {
    if (cluster) cluster.setMap(null);
    return;
  }

  const mapBounds = map.getBounds();
  const paths = activePolygon.getPaths().getArray().map(path => path.getArray());

  // 지도 영역에 포함된 마커만 먼저 필터링
  const visibleInMap = markers.filter(m => mapBounds.hasLatLng(m.getPosition()));

  // 그 중에서 폴리곤 내부에 포함된 마커만 필터링
  const visibleMarkers = visibleInMap.filter(m =>
    isPointInsidePolygon(m.getPosition(), paths)
  );

  // 기존 클러스터 제거 후 재생성
  if (cluster) cluster.setMap(null);

  cluster = new MarkerClustering({
    map,
    markers: visibleMarkers,
    disableClickZoom: false,
    gridSize: 300,
    minClusterSize: 1,
    maxZoom: 18,
    icons: clusterIcons,
    indexGenerator: [10, 100, 200, 500, 1000],
    stylingFunction: (c, count) => {
      c.getElement().querySelector('div:first-child').innerText = count;
    }
  });
}

/* -------------------------------
   ✅ 기타 UI/기능
--------------------------------*/
let myLocationMarker=null;
function goMyLocation(){
  if(!navigator.geolocation)return;
  navigator.geolocation.getCurrentPosition(pos=>{
    const lat=pos.coords.latitude, lng=pos.coords.longitude;
    const loc=new naver.maps.LatLng(lat,lng);
    if(!myLocationMarker){
      myLocationMarker=new naver.maps.Marker({
        position:loc,map:map,
        icon:{url:"https://maps.gstatic.com/mapfiles/ms2/micons/red-dot.png",
          size:new naver.maps.Size(32,32),scaledSize:new naver.maps.Size(32,32)}
      });
    } else myLocationMarker.setPosition(loc);
    map.setCenter(loc); map.setZoom(16);
    updateAddress(lat,lng);
  },()=>{addressBox.innerText="위치 정보를 가져올 수 없습니다.";});
}

function zoomIn(){ map.setZoom(map.getZoom()+1); }
function zoomOut(){ map.setZoom(map.getZoom()-1); }

function handleFilterChange(type){
  const filterBtn=document.querySelectorAll(".filterBox button");
  filterBtn.forEach((el,idx)=>el.classList.toggle("active",type===idx));
  markerDataList=(type===0)?markerData:markerData.filter(v=>v.type===type);
  updateRegionByCenter();
}

naver.maps.Event.addListener(map,'idle',updateRegionByCenter);
naver.maps.Event.addListener(map,'zoom_changed',()=>{updateClusterIconsByZoom();updateRegionByCenter();});
window.addEventListener("load",()=>{goMyLocation();updateRegionByCenter();});

naver.maps.Event.addListener(map,"click",()=>{
  document.getElementById("mapComponent").classList.toggle("hide");
});

function getBaseIcon(size){
  return {
    content:`<div style="cursor:pointer;width:${size}px;height:${size}px;line-height:${size+2}px;font-size:${Math.max(12,size/3)}px;color:white;text-align:center;font-weight:bold;background:url(./image/baseIcon.png);background-size:contain;"></div>`,
    size:new naver.maps.Size(size,size),
    anchor:new naver.maps.Point(size/2,size/2)
  };
}
function updateClusterIconsByZoom(){
  const zoom=map.getZoom(),defaultZoom=16-zoom;
  let iconSize=(defaultZoom>0)?50+(10*defaultZoom):50;
  clusterIcons=[1,2,3,4,5].map(()=>getBaseIcon(iconSize));
  if(cluster) updateMarkersByPolygon();
}
let clusterIcons=[1,2,3,4,5].map(()=>getBaseIcon(40));