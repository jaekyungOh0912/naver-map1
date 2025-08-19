/* -------------------------------
     전역 변수 및 초기 설정
--------------------------------*/
let markerDataList = markerData; // 기본 마커 데이터
const map = new naver.maps.Map('map', {
  center: new naver.maps.LatLng(35.144, 129.060),
  zoom: 16, minZoom: 7, maxZoom: 19
});
const addressBox = document.getElementById("addressBox");

let cluster = null;            // 마커 클러스터
const markers = [];            // 지도에 표시된 마커 목록

/* -------------------------------
   주소 변환 및 검색
--------------------------------*/
// 현재 중심 좌표의 주소 갱신
function updateAddress(lat, lng) {
  naver.maps.Service.reverseGeocode({
    coords: new naver.maps.LatLng(lat, lng),
    orders: [naver.maps.Service.OrderType.ROAD_ADDR, naver.maps.Service.OrderType.ADDR].join(',')
  }, (status, response) => {
    if (status !== naver.maps.Service.Status.OK) {
      addressBox.innerText = "주소를 가져올 수 없습니다.";
      return;
    }
    const result = response.v2.address;
    addressBox.innerText = (result.roadAddress || result.jibunAddress || "주소 없음");
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
      resultBox.innerHTML = "<li style='padding:4px 6px;'>검색 결과가 없습니다.</li>";
      return;
    }

    resultList.forEach(addr => {
      const fullAddr = addr.roadAddress || addr.jibunAddress || "(주소 없음)";
      if (!fullAddr.includes(query) && !fullAddr.replace(/\s/g, "").includes(query.replace(/\s/g, ""))) return;

      const li = document.createElement("li");
      li.innerText = fullAddr;
      li.addEventListener("click", () => {
        const x = parseFloat(addr.x), y = parseFloat(addr.y);
        const newCenter = new naver.maps.LatLng(y, x);
        map.setCenter(newCenter);
        map.setZoom(16);
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
   화면 변화에 따른 마커/클러스터 갱신
--------------------------------*/
let regionUpdateTimer = null;

// 현재 지도 화면에 보이는 영역 내의 데이터만 사용
function getVisibleMarkerData() {
  const bounds = map.getBounds();
  return markerDataList.filter(m => bounds.hasLatLng(new naver.maps.LatLng(m.lat, m.lng)));
}

function applyRegionUpdate() {
  // 화면에 보이는 데이터만 마커 렌더링
  const visible = getVisibleMarkerData();
  console.log(visible);
  renderMarkers(visible);
  reclusterVisibleMarkers();
  // 중심 주소 갱신
  const c = map.getCenter();
  updateAddress(c.lat(), c.lng());
}

function updateRegionByCenter() {
  clearTimeout(regionUpdateTimer);
  regionUpdateTimer = setTimeout(() => {
    applyRegionUpdate();
  }, 200);
}

/* -------------------------------
   마커 관련
--------------------------------*/
const infoWindow = new naver.maps.InfoWindow({
  borderWidth: 0, disableAnchor: true, backgroundColor: "transparent",
  pixelOffset: new naver.maps.Point(0, -10)
});

function setMarkers(lat, lng, type) {
  const markerHTML = `<div class="marker"><img src="./image/type${type}.png"/></div>`;

  const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(lat, lng),
    icon: { content: markerHTML, size: new naver.maps.Size(30, 30), scaledSize: new naver.maps.Size(30, 30) }
  });

  // 마커 클릭 시 InfoBox 표시 (외부 변수 존재 시에만 동작)
  naver.maps.Event.addListener(marker, "click", () => {
    const infoBox = document.querySelector(".infoBox");
    if (!infoBox || typeof complexList === "undefined") return;

    const sortedData = [...complexList].sort((a, b) => b.popularity - a.popularity);
    infoBox.querySelector(".count").innerText = sortedData.length;
    setInfoContent(sortedData);
    infoBox.classList.add("show");
  });

  naver.maps.Event.addListener(map, "click", () => infoWindow.close());
  markers.push(marker);
}

function setInfoContent(sortedData) {
  const infoBody = document.querySelector(".infoBody");
  if (!infoBody) return;

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

function clearMarkers() {
  markers.forEach(m => m.setMap(null));
  markers.length = 0;
}

function renderMarkers(list) {
  clearMarkers();
  list.forEach(v =>
    setMarkers(v.lat, v.lng, v.type)
  );
}

// infoBox 외부 클릭 시 .show 제거
document.addEventListener("click", (e) => {
  const infoBox = document.querySelector(".infoBox");
  if (!infoBox) return;
  if (infoBox.contains(e.target)) return;
  if (e.target.closest(".marker")) return;
  infoBox.classList.remove("show");
});

// 정보 박스 정렬(옵션)
const handelSortFilter = (e, type) => {
  const sortFilter = document.querySelectorAll(".infoHead li");
  sortFilter.forEach((element) => {
    element.classList.remove("active");
  });

  if (typeof complexList === "undefined") return;

  const sortedData = [...complexList];

  switch (type) {
    case 1: sortedData.sort((a, b) => b.popularity - a.popularity); break;
    case 2: sortedData.sort((a, b) => a.name.localeCompare(b.name, 'ko')); break;
    case 3: sortedData.sort((a, b) => b.household_count - a.household_count); break;
    case 4: sortedData.sort((a, b) => new Date(b.move_in_date) - new Date(a.move_in_date)); break;
    case 5: sortedData.sort((a, b) => b.sale_count - a.sale_count); break;
    default: sortedData.sort((a, b) => b.popularity - a.popularity);
  }

  setInfoContent(sortedData);
  e.target.classList.add("active");
};

/* -------------------------------
   클러스터
--------------------------------*/
function reclusterVisibleMarkers() {
  // 현재 화면 내 마커만 클러스터링
  const bounds = map.getBounds();
  const visibleMarkers = markers.filter(m => bounds.hasLatLng(m.getPosition()));

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
   기타 UI/기능
--------------------------------*/
let myLocationMarker = null;
function goMyLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    const loc = new naver.maps.LatLng(lat, lng);
    if (!myLocationMarker) {
      myLocationMarker = new naver.maps.Marker({
        position: loc, map: map,
        icon: {
          url: "https://maps.gstatic.com/mapfiles/ms2/micons/red-dot.png",
          size: new naver.maps.Size(32, 32), scaledSize: new naver.maps.Size(32, 32)
        }
      });
    } else myLocationMarker.setPosition(loc);
    map.setCenter(loc);
    map.setZoom(16);
    updateAddress(lat, lng);
  }, () => { addressBox.innerText = "위치 정보를 가져올 수 없습니다."; });
}

function zoomIn() { map.setZoom(map.getZoom() + 1); }
function zoomOut() { map.setZoom(map.getZoom() - 1); }

function handleFilterChange(type) {
  const filterBtn = document.querySelectorAll(".filterBox button");
  filterBtn.forEach((el, idx) => el.classList.toggle("active", type === idx));
  markerDataList = (type === 0) ? markerData : markerData.filter(v => v.type === type);
  updateRegionByCenter();
}

/* -------------------------------
   이벤트 바인딩
--------------------------------*/
naver.maps.Event.addListener(map, 'idle', updateRegionByCenter);
naver.maps.Event.addListener(map, 'dragend', updateRegionByCenter);
naver.maps.Event.addListener(map, 'zoom_changed', () => { updateClusterIconsByZoom(); updateRegionByCenter(); });
window.addEventListener("load", () => { goMyLocation(); updateRegionByCenter(); });

naver.maps.Event.addListener(map, "click", () => {
  const el = document.getElementById("mapComponent");
  if (el) el.classList.toggle("hide");
});

/* -------------------------------
   클러스터 아이콘 크기 조절
--------------------------------*/
function getBaseIcon(size) {
  return {
    content: `<div style="cursor:pointer;width:${size}px;height:${size}px;line-height:${size + 2}px;font-size:${Math.max(12, size / 3)}px;color:white;text-align:center;font-weight:bold;background:url(./image/baseIcon.png);background-size:contain;"></div>`,
    size: new naver.maps.Size(size, size),
    anchor: new naver.maps.Point(size / 2, size / 2)
  };
}

function updateClusterIconsByZoom() {
  const zoom = map.getZoom(), defaultZoom = 16 - zoom;
  let iconSize = (defaultZoom > 0) ? 50 + (10 * defaultZoom) : 50;
  clusterIcons = [1, 2, 3, 4, 5].map(() => getBaseIcon(iconSize));
  // 아이콘 크기 변경 후 재클러스터
  reclusterVisibleMarkers();
}
let clusterIcons = [1, 2, 3, 4, 5].map(() => getBaseIcon(40));
