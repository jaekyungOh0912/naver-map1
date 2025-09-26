/* -------------------------------
  전역 변수 및 초기 설정
--------------------------------*/
let markerDataList = (typeof markerData !== "undefined" ? markerData : []);
const map = new naver.maps.Map('map', {
  center: new naver.maps.LatLng(35.144, 129.060),
  zoom: 16, minZoom: 7, maxZoom: 22
});
const addressBox = document.getElementById("addressBox");

let cluster = null;            // 마커 클러스터
const markers = [];            // 지도에 표시된 마커 목록
let regionUpdateTimer = null;  // 디바운스
let myLocationMarker = null;   // 내 위치 마커

/* -------------------------------
  클러스터 아이콘 유틸
--------------------------------*/
function getBaseIcon(size) {
  return {
    content: `<div style="cursor:pointer;width:${size}px;height:${size}px;line-height:${size + 2}px;font-size:${Math.max(12, size / 3)}px;color:white;text-align:center;font-weight:bold;background:url(./image/baseIcon.png);background-size:contain;"></div>`,
    size: new naver.maps.Size(size, size),
    anchor: new naver.maps.Point(size / 2, size / 2)
  };
}
let clusterIcons = [1, 2, 3, 4, 5].map(() => getBaseIcon(40));

function updateClusterIconsByZoom() {
  const zoom = map.getZoom();
  const defaultZoom = 16 - zoom;
  const iconSize = (defaultZoom > 0) ? 50 + (10 * defaultZoom) : 50;
  clusterIcons = [1, 2, 3, 4, 5].map(() => getBaseIcon(iconSize));
  // 아이콘 크기 갱신 후 재클러스터
  reclusterVisibleMarkers();
}

/* -------------------------------
  주소 변환 및 검색
--------------------------------*/
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
    addressBox.innerText = "📍 " + (result.roadAddress || result.jibunAddress || "주소 없음");
  });
}

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
        new naver.maps.Marker({ position: newCenter, map });
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
function getVisibleMarkerData() {
  const bounds = map.getBounds();
  return markerDataList.filter(m => bounds.hasLatLng(new naver.maps.LatLng(m.lat, m.lng)));
}

function applyRegionUpdate() {
  const visible = getVisibleMarkerData();
  renderMarkers(visible);
  reclusterVisibleMarkers();

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

function setMarkers(lat, lng, type, name, price, count, active) {
  const markerHTML = `<div class="marker"><img src="./image/type${type}.png"/></div>`;

  const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(lat, lng),
    icon: { content: markerHTML, size: new naver.maps.Size(30, 30), scaledSize: new naver.maps.Size(30, 30) }
  });

  // 클러스터 클릭 시 참조할 수 있도록 데이터 저장
  marker.__data = { lat, lng, type, name, price, count, active };

  // (옵션) 마커 클릭
  naver.maps.Event.addListener(marker, "click", () => {
    const infoBox = document.querySelector(".infoBox");
    if (!infoBox || typeof complexList === "undefined") return;
    const sortedData = [...complexList].sort((a, b) => b.popularity - a.popularity);
    const cnt = infoBox.querySelector(".count");
    if (cnt) cnt.innerText = sortedData.length;
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
      <p>${value.type}</p>
    `;
    infoBody.appendChild(box);
  });
}

function setInfoContent2(sortedData) {
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
    setMarkers(v.lat, v.lng, v.type, v.name || "건물명 없음", v.price || 0, v.count, v.active)
  );
}

// infoBox 외부 클릭 시 닫기
document.addEventListener("click", (e) => {
  const infoBox = document.querySelector(".infoBox");
  if (!infoBox) return;
  if (infoBox.contains(e.target)) return;
  if (e.target.closest(".marker")) return;
  infoBox.classList.remove("show");
});

// (옵션) 정보 박스 정렬
const handelSortFilter = (e, type) => {
  const sortFilter = document.querySelectorAll(".infoHead li");
  sortFilter.forEach((element) => element.classList.remove("active"));

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
  (핵심) 다양한 빌드 대응: 클러스터 DOM 클릭으로 마커 찾기
--------------------------------*/
// 거리(제곱) 계산
const _dist2 = (a, b) => {
  const dx = a.lng() - b.lng();
  const dy = a.lat() - b.lat();
  return dx*dx + dy*dy;
};
const _toLatLng = (v) => {
  if (v && typeof v.lat === 'function' && typeof v.lng === 'function') return v;                 // LatLng
  if (v && typeof v.lat === 'number' && typeof v.lng === 'number') return new naver.maps.LatLng(v.lat, v.lng); // {lat,lng}
  if (Array.isArray(v) && v.length >= 2) return new naver.maps.LatLng(v[1], v[0]);               // [lng,lat]
  return null;
};
const _collectGroups = (cl) => {
  const pools = [
    cl._clusters, cl.clusters, cl._clusterList, cl._clusterArr,
    cl._grid?.clusters, cl._grid?._clusters
  ].filter(Array.isArray);
  return pools.flat();
};
const _markersOfGroup = (group, allVisibleMarkers=[]) => {
  if (!group) return [];
  if (typeof group.getMarkers === 'function') return group.getMarkers();
  if (Array.isArray(group.markers)) return group.markers;
  if (Array.isArray(group._markers)) return group._markers;

  // ✅ 현재 빌드에서 쓰는 필드
  if (Array.isArray(group._clusterMember)) return group._clusterMember;

  const idxs = group.indexes || group._indexes || group.markerIndexes || group._markerIndexes;
  if (Array.isArray(idxs) && allVisibleMarkers.length) return idxs.map(i => allVisibleMarkers[i]).filter(Boolean);
  if (Array.isArray(group.children)) return group.children;
  return [];
};
const _centerOfGroup = (group) => {
  if (!group) return null;
  if (typeof group.getCenter === 'function') return group.getCenter();
  if (group.center) return _toLatLng(group.center);
  if (group._center) return _toLatLng(group._center);
  return null;
};

const clusterInfoWindow = new naver.maps.InfoWindow({
  borderWidth: 1,
  backgroundColor: "#fff",
  anchorSize: new naver.maps.Size(10, 10),
  anchorSkew: true,
  disableAnchor: false
});

// 중복 바인딩 방지 플래그 사용
const bindClusterDomClick = (clusterMarker) => {
  const el = clusterMarker.getElement();

  if (!el || el.__binded) return;
  el.__binded = true;
  el.style.pointerEvents = 'auto';

  el.addEventListener('click', (ev) => {
    ev.stopPropagation();

    // 쉬운 케이스부터 시도
    if (typeof clusterMarker.getMarkers === 'function') {
      const ms = clusterMarker.getMarkers() || [];
      console.log('markers.length =', ms.length);
      console.table(ms.map(m => m.__data ?? { lat:m.getPosition().lat(), lng:m.getPosition().lng() }));
      return;
    }
    if (typeof clusterMarker.getCluster === 'function') {
      const inner = clusterMarker.getCluster();
      const ms = _markersOfGroup(inner, cluster.__visibleMarkers) || [];
      console.log('markers.length =', ms.length);
      console.table(ms.map(m => m.__data ?? { lat:m.getPosition().lat(), lng:m.getPosition().lng() }));
      return;
    }

    // 내부 그룹 배열에서 가장 가까운 중심을 가진 그룹을 찾는다
    if (!cluster) {
      console.warn('cluster 인스턴스를 찾을 수 없습니다.');
      return;
    }
    const pos = clusterMarker.getPosition?.();
    if (!pos) {
      console.warn('clusterMarker 위치를 알 수 없습니다.', clusterMarker);
      return;
    }
    const groups = _collectGroups(cluster);
    if (!groups.length) {
      console.warn('클러스터 그룹 배열을 찾지 못했습니다. cluster 구조:', cluster);
      return;
    }

    let best = null, bestD = Infinity;
    for (const g of groups) {
      const gc = _centerOfGroup(g);
      if (!gc) continue;
      const d2 = _dist2(gc, pos);
      if (d2 < bestD) { bestD = d2; best = g; }
    }
    if (!best) {
      console.warn('가까운 그룹을 찾지 못했습니다.');
      return;
    }

    const ms = _markersOfGroup(best, cluster._clusterMember);
    if (!ms.length) {
      console.warn('선택된 그룹에 마커가 없습니다. group:', best);
      return;
    }

    const items = ms.map(m => m.__data ?? (() => { const p = m.getPosition(); return { lat:p.lat(), lng:p.lng() }; })());
    console.log(items);
    const infoBox = document.querySelector(".infoBox");
    const cnt = infoBox.querySelector(".count");
    if (cnt) cnt.innerText = items.length;
    setInfoContent2(items);
    infoBox.classList.add("show");
  });
};

/* -------------------------------
  클러스터 (설정 유지 + DOM 클릭 바인딩)
--------------------------------*/
function reclusterVisibleMarkers() {
  // 현재 화면 내 마커만 클러스터링
  const bounds = map.getBounds();
  const visibleMarkers = markers.filter(m => bounds.hasLatLng(m.getPosition()));

  if (cluster) cluster.setMap(null);

  cluster = new MarkerClustering({
    map,
    markers: visibleMarkers,
    disableClickZoom: true,
    gridSize: 300,
    minClusterSize: 1,                 // ← 요청 구성 유지
    maxZoom: 18,                       // ← 유지
    icons: clusterIcons,               // ← 유지
    indexGenerator: [10, 100, 200, 500, 1000], // ← 유지
    stylingFunction: (c, count) => {
      const firstDiv = c.getElement().querySelector('div:first-child');
      if (firstDiv) firstDiv.innerText = count;
      bindClusterDomClick(c); // DOM 클릭 리스너 1회 바인딩
    }
  });

  // 보이는 마커 목록을 인스턴스에 저장(인덱스 기반 빌드 대응)
  cluster.__visibleMarkers = visibleMarkers;
}

/* -------------------------------
  기타 UI/기능
--------------------------------*/
function goMyLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    const loc = new naver.maps.LatLng(lat, lng);
    if (!myLocationMarker) {
      myLocationMarker = new naver.maps.Marker({
        position: loc, map,
        icon: {
          url: "https://maps.gstatic.com/mapfiles/ms2/micons/red-dot.png",
          size: new naver.maps.Size(32, 32),
          scaledSize: new naver.maps.Size(32, 32)
        }
      });
    } else {
      myLocationMarker.setPosition(loc);
    }
    map.setCenter(loc);
    map.setZoom(16);
    updateAddress(lat, lng);
  }, () => {
    addressBox.innerText = "위치 정보를 가져올 수 없습니다.";
  });
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
naver.maps.Event.addListener(map, 'zoom_changed', () => {
  updateClusterIconsByZoom();
  updateRegionByCenter();
});
window.addEventListener("load", () => {
  goMyLocation();
  updateRegionByCenter();
});
naver.maps.Event.addListener(map, "click", () => {
  const el = document.getElementById("mapComponent");
  if (el) el.classList.toggle("hide");
});
