
 // ==========================================================
 // SMART ENERGY METER
 // FIREBASE + LOGIN + DASHBOARD
 // FOKUS ENERGI: kWh
 // ==========================================================

 // ==========================================================
 // FIREBASE CONFIGURATION
 // ==========================================================

 const firebaseConfig = {
     apiKey: "AIzaSyBKWpeSnxZ5NfcveYvYRhZB8oCdW6hCPBw",
     authDomain: "smart-energy-meter-bff7d.firebaseapp.com",
     databaseURL: "https://smart-energy-meter-bff7d-default-rtdb.asia-southeast1.firebasedatabase.app",
     projectId: "smart-energy-meter-bff7d"
 };

 // ==========================================================
 // FIREBASE INITIALIZATION
 // ==========================================================

 firebase.initializeApp(firebaseConfig);

 const db = firebase.database();
 const auth = firebase.auth();

 // ==========================================================
 // GLOBAL VARIABLES
 // ==========================================================

 let currentUser = null;
 let dashboardStarted = false;

 let powerChart = null;
 let voltageChart = null;
 let currentChart = null;
 let monitorPowerChart = null;
 let energyChart = null;

 let currentVoltage = 0;
 let currentCurrent = 0;
 let currentPower = 0;

 // Nilai energi yang dibaca dari Firebase disimpan dalam Wh.
 // Konversi ke kWh dilakukan saat ditampilkan.
 let currentEnergy = 0;

 let activeLimit = 900;
 let lastSensorUpdate = 0;

 const MAX_POINTS = 30;

 let powerData = [];
 let historyData = [];

 // ==========================================================
 // FIREBASE AUTH STATE
 // ==========================================================

 auth.onAuthStateChanged(function(user) {
     currentUser = user;

     const loginPage = document.getElementById("loginPage");
     const appContent = document.getElementById("appContent");
     const userEmail = document.getElementById("firebaseUserEmail");

     if (user) {
         if (loginPage) loginPage.classList.add("d-none");
         if (appContent) appContent.classList.remove("d-none");

         if (userEmail) {
             userEmail.textContent = user.email || "";
         }

         console.log("Firebase Login berhasil:", user.email);
         startDashboard();
     } else {
         if (appContent) appContent.classList.add("d-none");
         if (loginPage) loginPage.classList.remove("d-none");
         if (userEmail) userEmail.textContent = "";

         console.log("User belum login Firebase.");
     }
 });

 // ==========================================================
 // LOGIN FORM
 // ==========================================================

 const loginForm = document.getElementById("loginForm");

 if (loginForm) {
     loginForm.addEventListener("submit", async function(event) {
         event.preventDefault();

         const email =
             document.getElementById("loginEmail").value.trim();

         const password =
             document.getElementById("loginPassword").value;

         const loginButton =
             document.getElementById("loginButton");

         const loginError =
             document.getElementById("loginError");

         if (loginError) {
             loginError.textContent = "";
             loginError.classList.add("d-none");
         }

         if (!email || !password) {
             showLoginError("Email dan password wajib diisi.");
             return;
         }

         try {
             if (loginButton) {
                 loginButton.disabled = true;
                 loginButton.innerHTML =
                     '<span class="spinner-border spinner-border-sm me-2"></span>Memproses...';
             }

             await auth.signInWithEmailAndPassword(email, password);
         } catch (error) {
             console.error("Firebase Login Error:", error);
             showLoginError(getLoginErrorMessage(error));
         } finally {
             if (loginButton) {
                 loginButton.disabled = false;
                 loginButton.innerHTML =
                     '<i class="bi bi-box-arrow-in-right"></i> Login';
             }
         }
     });
 }

 // ==========================================================
 // LOGIN ERROR
 // ==========================================================

 function showLoginError(message) {
     const loginError = document.getElementById("loginError");

     if (!loginError) return;

     loginError.textContent = message;
     loginError.classList.remove("d-none");
 }

 function getLoginErrorMessage(error) {
     switch (error.code) {
         case "auth/invalid-email":
             return "Format email tidak valid.";

         case "auth/user-disabled":
             return "Akun Firebase ini dinonaktifkan.";

         case "auth/user-not-found":
         case "auth/wrong-password":
         case "auth/invalid-login-credentials":
             return "Email atau password salah.";

         case "auth/too-many-requests":
             return "Terlalu banyak percobaan login. Coba lagi beberapa saat.";

         case "auth/network-request-failed":
             return "Koneksi internet bermasalah.";

         default:
             return "Login gagal. Periksa email, password, dan koneksi internet.";
     }
 }

 // ==========================================================
 // SHOW / HIDE PASSWORD
 // ==========================================================

 const togglePassword = document.getElementById("togglePassword");

 if (togglePassword) {
     togglePassword.addEventListener("click", function() {
         const password = document.getElementById("loginPassword");
         const icon = togglePassword.querySelector("i");

         if (!password || !icon) return;

         if (password.type === "password") {
             password.type = "text";
             icon.className = "bi bi-eye-slash";
         } else {
             password.type = "password";
             icon.className = "bi bi-eye";
         }
     });
 }

 // ==========================================================
 // LOGOUT
 // ==========================================================

 async function logout() {
     try {
         await auth.signOut();
         console.log("Logout berhasil.");
     } catch (error) {
         console.error("Firebase Logout Error:", error);
         alert("Logout gagal. Silakan coba lagi.");
     }
 }

 // ==========================================================
 // START DASHBOARD
 // ==========================================================

 function startDashboard() {
     if (dashboardStarted) return;

     dashboardStarted = true;
     initializeDashboard();
 }

 // ==========================================================
 // DASHBOARD INITIALIZATION
 // ==========================================================

 function initializeDashboard() {

     // ======================================================
     // HELPER
     // ======================================================

     function num(value, fallback = 0) {
         const result = Number(value);
         return Number.isFinite(result) ? result : fallback;
     }

     function fixed(value, decimal = 2) {
         return num(value).toFixed(decimal);
     }

     // ======================================================
     // KONVERSI ENERGI Wh -> kWh
     // ======================================================

     function toKwh(energyWh) {
         return num(energyWh) / 1000;
     }

     function formatKwh(energyWh) {
         return toKwh(energyWh).toFixed(3);
     }

     // ======================================================
     // PAGE NAVIGATION
     // ======================================================

     window.showPage = function(pageId) {
         if (!currentUser) return;

         document.querySelectorAll(".page").forEach(function(page) {
             page.classList.add("d-none");
         });

         const target = document.getElementById(pageId);

         if (target) {
             target.classList.remove("d-none");
         }

         setTimeout(resizeCharts, 100);
     };

     // ======================================================
     // CLOCK
     // ======================================================

     function updateClock() {
         const now = new Date();

         const tanggal = document.getElementById("tanggal");
         const jam = document.getElementById("jam");

         if (tanggal) {
             tanggal.textContent = now.toLocaleDateString("id-ID");
         }

         if (jam) {
             jam.textContent = now.toLocaleTimeString("id-ID");
         }
     }

     updateClock();
     setInterval(updateClock, 1000);

     // ======================================================
     // CHART DATA
     // ======================================================

     const chartLabels = [];
     const voltageValues = [];
     const currentValues = [];
     const powerValues = [];

     // Nilai grafik energi disimpan dalam kWh.
     const energyValues = [];

     function chartOptions(yTitle) {
         return {
             responsive: true,
             maintainAspectRatio: true,
             animation: false,

             interaction: {
                 intersect: false,
                 mode: "index"
             },

             plugins: {
                 legend: {
                     display: true
                 }
             },

             scales: {
                 x: {
                     title: {
                         display: true,
                         text: "Waktu"
                     }
                 },

                 y: {
                     beginAtZero: true,
                     title: {
                         display: true,
                         text: yTitle
                     }
                 }
             }
         };
     }

     // ======================================================
     // CREATE POWER CHART
     // ======================================================

     function createPowerChart() {
         const canvas = document.getElementById("powerChart");

         if (!canvas) return;

         powerChart = new Chart(canvas, {
             type: "line",

             data: {
                 labels: chartLabels,

                 datasets: [{
                     label: "Daya (W)",
                     data: powerValues,
                     borderWidth: 3,
                     tension: 0.3,
                     fill: true
                 }]
             },

             options: chartOptions("Daya (W)")
         });
     }

     // ======================================================
     // CREATE PARAMETER CHART
     // ======================================================

     function createParameterChart(canvasId, label, dataArray, yTitle) {
         const canvas = document.getElementById(canvasId);

         if (!canvas) return null;

         return new Chart(canvas, {
             type: "line",

             data: {
                 labels: chartLabels,

                 datasets: [{
                     label: label,
                     data: dataArray,
                     borderWidth: 3,
                     tension: 0.3,
                     fill: false
                 }]
             },

             options: chartOptions(yTitle)
         });
     }

     // ======================================================
     // CREATE ALL CHARTS
     // ======================================================

     function createCharts() {
         createPowerChart();

         voltageChart = createParameterChart(
             "voltageChart",
             "Tegangan (V)",
             voltageValues,
             "Tegangan (V)"
         );

         currentChart = createParameterChart(
             "currentChart",
             "Arus (A)",
             currentValues,
             "Arus (A)"
         );

         monitorPowerChart = createParameterChart(
             "monitorPowerChart",
             "Daya (W)",
             powerValues,
             "Daya (W)"
         );

         energyChart = createParameterChart(
             "energyChart",
             "Energi (kWh)",
             energyValues,
             "Energi (kWh)"
         );
     }

     createCharts();

     // ======================================================
     // UPDATE CHARTS
     // ======================================================

     function updateCharts() {
         if (powerChart) powerChart.update("none");
         if (voltageChart) voltageChart.update("none");
         if (currentChart) currentChart.update("none");
         if (monitorPowerChart) monitorPowerChart.update("none");
         if (energyChart) energyChart.update("none");
     }

     // ======================================================
     // RESIZE CHARTS
     // ======================================================

     function resizeCharts() {
         if (powerChart) powerChart.resize();
         if (voltageChart) voltageChart.resize();
         if (currentChart) currentChart.resize();
         if (monitorPowerChart) monitorPowerChart.resize();
         if (energyChart) energyChart.resize();
     }

     // ======================================================
     // FIREBASE CONNECTION STATUS
     // ======================================================

     db.ref(".info/connected").on("value", function(snapshot) {
         const connected = snapshot.val() === true;

         const statusFirebase =
             document.getElementById("statusFirebase");

         const firebaseStatus =
             document.getElementById("firebaseStatus");

         if (connected) {
             if (statusFirebase) {
                 statusFirebase.textContent = "Firebase Connected";
                 statusFirebase.className = "badge bg-success";
             }

             if (firebaseStatus) {
                 firebaseStatus.textContent = "Online";
                 firebaseStatus.className = "badge bg-success";
             }
         } else {
             if (statusFirebase) {
                 statusFirebase.textContent = "Disconnected";
                 statusFirebase.className = "badge bg-danger";
             }

             if (firebaseStatus) {
                 firebaseStatus.textContent = "Offline";
                 firebaseStatus.className = "badge bg-danger";
             }
         }
     });

     // ======================================================
     // SENSOR DATA
     // ======================================================

     db.ref("sensor").on("value", function(snapshot) {
         const data = snapshot.val();

         if (!data) return;

         // --------------------------------------------------
         // READ DATA
         // --------------------------------------------------

         currentVoltage = num(data.voltage);
         currentCurrent = num(data.current);
         currentPower = num(data.power);

         // Firebase masih menyimpan data energi dalam Wh.
         currentEnergy = num(data.energy);

         lastSensorUpdate = Date.now();

         // --------------------------------------------------
         // DASHBOARD VALUE
         // --------------------------------------------------

         const voltage = document.getElementById("voltage");
         const current = document.getElementById("current");
         const power = document.getElementById("power");

         const energy = document.getElementById("energy");
         const energyKwh = document.getElementById("energyKwh");

         if (voltage) {
             voltage.textContent = fixed(currentVoltage, 2);
         }

         if (current) {
             current.textContent = fixed(currentCurrent, 2);
         }

         if (power) {
             power.textContent = fixed(currentPower, 2);
         }

         // Semua elemen energi di dashboard menggunakan kWh.
         if (energy) {
             energy.textContent = formatKwh(currentEnergy);
         }

         if (energyKwh) {
             energyKwh.textContent = formatKwh(currentEnergy);
         }

         // --------------------------------------------------
         // MONITORING VALUES
         // --------------------------------------------------

         const monitorVoltage =
             document.getElementById("monitorVoltage");

         const monitorCurrent =
             document.getElementById("monitorCurrent");

         const monitorPower =
             document.getElementById("monitorPower");

         const monitorEnergy =
             document.getElementById("monitorEnergy");

         if (monitorVoltage) {
             monitorVoltage.textContent = fixed(currentVoltage, 2);
         }

         if (monitorCurrent) {
             monitorCurrent.textContent = fixed(currentCurrent, 2);
         }

         if (monitorPower) {
             monitorPower.textContent = fixed(currentPower, 2);
         }

         if (monitorEnergy) {
             monitorEnergy.textContent = formatKwh(currentEnergy);
         }

         // --------------------------------------------------
         // CHART DATA
         // --------------------------------------------------

         const time = new Date().toLocaleTimeString("id-ID");

         chartLabels.push(time);
         voltageValues.push(currentVoltage);
         currentValues.push(currentCurrent);
         powerValues.push(currentPower);

         // Konversi Wh ke kWh untuk grafik energi.
         energyValues.push(toKwh(currentEnergy));

         // --------------------------------------------------
         // LIMIT CHART POINTS
         // --------------------------------------------------

         if (chartLabels.length > MAX_POINTS) {
             chartLabels.shift();
             voltageValues.shift();
             currentValues.shift();
             powerValues.shift();
             energyValues.shift();
         }

         // --------------------------------------------------
         // STATISTICS
         // --------------------------------------------------

         powerData.push(currentPower);

         if (powerData.length > 100) {
             powerData.shift();
         }

         updateStatistics();
         updateDeviceStatus();
         updateAlert();
         updateCharts();
     });

     // ======================================================
     // DEVICE STATUS
     // ======================================================

     function updateDeviceStatus() {
         const online = (Date.now() - lastSensorUpdate) < 10000;

         const espStatus = document.getElementById("espStatus");
         const pzemStatus = document.getElementById("pzemStatus");
         const lastUpdate = document.getElementById("lastUpdate");

         if (online) {
             if (espStatus) {
                 espStatus.textContent = "Online";
                 espStatus.className = "badge bg-success";
             }

             if (pzemStatus) {
                 pzemStatus.textContent = "Online";
                 pzemStatus.className = "badge bg-success";
             }
         } else {
             if (espStatus) {
                 espStatus.textContent = "Offline";
                 espStatus.className = "badge bg-danger";
             }

             if (pzemStatus) {
                 pzemStatus.textContent = "Offline";
                 pzemStatus.className = "badge bg-danger";
             }
         }

         if (lastUpdate) {
             lastUpdate.textContent = lastSensorUpdate > 0
                 ? new Date(lastSensorUpdate).toLocaleTimeString("id-ID")
                 : "-";
         }
     }

     // ======================================================
     // POWER STATISTICS
     // ======================================================

     function updateStatistics() {
         const avgElement = document.getElementById("avgPower");
         const maxElement = document.getElementById("maxPower");
         const minElement = document.getElementById("minPower");
         const countElement = document.getElementById("sampleCount");

         if (powerData.length === 0) return;

         const sum = powerData.reduce(function(total, value) {
             return total + value;
         }, 0);

         const average = sum / powerData.length;
         const maximum = Math.max(...powerData);
         const minimum = Math.min(...powerData);

         if (avgElement) avgElement.textContent = average.toFixed(2);
         if (maxElement) maxElement.textContent = maximum.toFixed(2);
         if (minElement) minElement.textContent = minimum.toFixed(2);
         if (countElement) countElement.textContent = powerData.length;
     }

     // ======================================================
     // SETTING BATAS DAYA
     // ======================================================

     db.ref("setting/batas").on("value", function(snapshot) {
         if (!snapshot.exists()) return;

         activeLimit = num(snapshot.val(), 900);

         const batasAktif = document.getElementById("batasAktif");
         const alertLimit = document.getElementById("alertLimit");
         const inputBatas = document.getElementById("inputBatas");

         if (batasAktif) {
             batasAktif.textContent = activeLimit;
         }

         if (alertLimit) {
             alertLimit.textContent = activeLimit;
         }

         if (inputBatas && document.activeElement !== inputBatas) {
             inputBatas.value = activeLimit;
         }

         updateAlert();
     });

     // ======================================================
     // SAVE LIMIT
     // ======================================================

     window.simpanBatas = function() {
         const input = document.getElementById("inputBatas");

         if (!input) return;

         const batas = Number(input.value);

         if (!Number.isFinite(batas) || batas < 0) {
             alert("Masukkan batas daya yang valid.");
             return;
         }

         db.ref("setting/batas").set(batas)
             .then(function() {
                 alert("Pengaturan berhasil disimpan.");
             })
             .catch(function(error) {
                 console.error(error);
                 alert("Pengaturan gagal disimpan.");
             });
     };

     // ======================================================
     // ALERT / NOTIFICATION
     // ======================================================

     function updateAlert() {
         const alertBox = document.getElementById("alertBox");
         const dashboardAlert = document.getElementById("dashboardAlert");
         const alertTitle = document.getElementById("alertTitle");
         const alertMessage = document.getElementById("alertMessage");

         const dashboardAlertTitle =
             document.getElementById("dashboardAlertTitle");

         const dashboardAlertText =
             document.getElementById("dashboardAlertText");

         const alertLimit = document.getElementById("alertLimit");

         if (alertLimit) {
             alertLimit.textContent = activeLimit;
         }

         const overLimit = currentPower > activeLimit;

         if (overLimit) {
             if (alertBox) {
                 alertBox.className = "alert alert-danger";
             }

             if (alertTitle) {
                 alertTitle.textContent = "Peringatan Batas Daya";
             }

             if (alertMessage) {
                 alertMessage.textContent =
                     "Daya saat ini " + currentPower.toFixed(2) +
                     " W, melebihi batas " + activeLimit.toFixed(2) + " W.";
             }

             if (dashboardAlert) {
                 dashboardAlert.classList.remove("d-none");
                 dashboardAlert.className = "alert alert-danger mt-4";
             }

             if (dashboardAlertTitle) {
                 dashboardAlertTitle.textContent = "Peringatan Batas Daya";
             }

             if (dashboardAlertText) {
                 dashboardAlertText.textContent =
                     "Daya saat ini " + currentPower.toFixed(2) +
                     " W melebihi batas " + activeLimit.toFixed(2) + " W.";
             }
         } else {
             if (alertBox) {
                 alertBox.className = "alert alert-success";
             }

             if (alertTitle) {
                 alertTitle.textContent = "Kondisi Normal";
             }

             if (alertMessage) {
                 alertMessage.textContent =
                     "Konsumsi daya berada di bawah batas yang ditentukan.";
             }

             if (dashboardAlert) {
                 dashboardAlert.classList.add("d-none");
             }
         }
     }

     // ======================================================
     // HISTORY
     // ======================================================

     db.ref("history").on("value", function(snapshot) {
         const table = document.getElementById("historyTable");

         if (!table) return;

         table.innerHTML = "";
         historyData = [];

         if (!snapshot.exists()) {
             table.innerHTML = `
                 <tr>
                     <td colspan="5" class="text-muted">
                         Belum ada data riwayat.
                     </td>
                 </tr>
             `;
             return;
         }

         snapshot.forEach(function(item) {
             const value = item.val();

             if (!value || typeof value !== "object") return;

             const timestamp = value.timestamp || item.key || "";
             const voltage = num(value.voltage);
             const current = num(value.current);
             const power = num(value.power);

             // Diasumsikan nilai energy pada history tersimpan dalam Wh.
             const energyWh = num(value.energy);
             const energyKwh = toKwh(energyWh);

             historyData.push({
                 timestamp: timestamp,
                 voltage: voltage,
                 current: current,
                 power: power,
                 energyKwh: energyKwh
             });

             const dateText = formatHistoryDate(timestamp);

             table.innerHTML += `
                 <tr>
                     <td>${escapeHtml(dateText)}</td>
                     <td>${voltage.toFixed(2)}</td>
                     <td>${current.toFixed(2)}</td>
                     <td>${power.toFixed(2)}</td>
                     <td>${energyKwh.toFixed(3)}</td>
                 </tr>
             `;
         });

         if (historyData.length === 0) {
             table.innerHTML = `
                 <tr>
                     <td colspan="5" class="text-muted">
                         Belum ada data riwayat.
                     </td>
                 </tr>
             `;
         }
     });

     // ======================================================
     // HISTORY DATE
     // ======================================================

     function formatHistoryDate(timestamp) {
         if (!timestamp) return "-";

         const date = new Date(timestamp);

         if (!Number.isNaN(date.getTime())) {
             return date.toLocaleString("id-ID");
         }

         return String(timestamp);
     }

     // ======================================================
     // ESCAPE HTML
     // ======================================================

     function escapeHtml(value) {
         return String(value ?? "")
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
     }

     // ======================================================
     // EXPORT HISTORY CSV
     // Energi diekspor dalam kWh
     // ======================================================

     window.exportHistoryCSV = function() {
         if (historyData.length === 0) {
             alert("Belum ada data riwayat untuk diekspor.");
             return;
         }

         let csv =
             "Waktu,Tegangan (V),Arus (A),Daya (W),Energi (kWh)\n";

         historyData.forEach(function(item) {
             csv +=
                 '"' + String(item.timestamp).replace(/"/g, '""') + '",' +
                 item.voltage + ',' +
                 item.current + ',' +
                 item.power + ',' +
                 item.energyKwh.toFixed(3) + '\n';
         });

         const blob = new Blob([csv], {
             type: "text/csv;charset=utf-8;"
         });

         const url = URL.createObjectURL(blob);
         const link = document.createElement("a");

         link.href = url;
         link.download = "riwayat-smart-energy-meter.csv";

         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);

         URL.revokeObjectURL(url);
     };

     // ======================================================
     // INITIAL PAGE
     // ======================================================

     window.showPage("dashboardPage");

     // ======================================================
     // INITIAL RESIZE
     // ======================================================

     setTimeout(resizeCharts, 300);
 }
