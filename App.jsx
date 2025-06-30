import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement } from 'chart.js';
import { Pie, Bar, Line } from 'react-chartjs-2';
import Swal from 'sweetalert2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import './App.css'; // Asegúrate de que este archivo CSS contenga los estilos necesarios

// Registra todos los elementos necesarios de Chart.js
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ChartDataLabels); 

// URL base de tu API
const API_BASE_URL = 'http://localhost:3001';

// Paleta de colores mejorada para los gráficos
const COLORS = [
  '#36A2EB', // Azul claro
  '#4BC0C0', // Turquesa
  '#FF9F40', // Naranja
  '#FF6384', // Rosa
  '#9966FF', // Morado
  '#FFCD56', // Amarillo
  '#C9CBCF', // Gris
  '#3CB371', // Verde medio
  '#FF4500', // Rojo anaranjado
  '#9370DB'  // Púrpura medio
];

function App() {
  // Estados para la autenticación
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Estados para la UI y datos
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dynamicData, setDynamicData] = useState([]);

  // Obtener año y mes actual para valores por defecto
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // getMonth() es base 0

  // Estados para los filtros de fecha y agrupación
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  // Valor por defecto para agrupar por categoría de producto
  const [groupByOption, setGroupByOption] = useState('dp.categoria_producto');
  // Nuevo estado para el tipo de gráfico seleccionado
  const [chartType, setChartType] = useState('pie'); // Por defecto, mostrar pastel

  // Generar lista de años dinámicamente (últimos 2, actual, próximos 2)
  const years = useMemo(() => Array.from({ length: 5 }, (_, i) => currentYear - 2 + i), [currentYear]);
  // Generar lista de meses con sus valores y etiquetas en español
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString('es-MX', { month: 'long' }) })), []);

  // Función para manejar el inicio de sesión
  const handleLogin = async (e) => {
    e.preventDefault(); // Prevenir el comportamiento por defecto del formulario
    setLoading(true);
    setError('');
    try {
      // Realizar la solicitud POST al endpoint de login
      const response = await axios.post(`${API_BASE_URL}/login`, { username, password });
      setToken(response.data.token); // Guardar el token en el estado
      localStorage.setItem('token', response.data.token); // Guardar el token en localStorage
      Swal.fire('¡Éxito!', 'Sesión iniciada correctamente', 'success'); // Mostrar notificación de éxito
    } catch (err) {
      // Capturar y mostrar errores de inicio de sesión
      setError(err.response?.data?.message || 'Error al iniciar sesión');
      Swal.fire('Error', err.response?.data?.message || 'Error al iniciar sesión', 'error');
    } finally {
      setLoading(false); // Desactivar el estado de carga
    }
  };

  // Función para manejar el cierre de sesión
  const handleLogout = () => {
    setToken(''); // Limpiar el token del estado
    localStorage.removeItem('token'); // Eliminar el token de localStorage
    setDynamicData([]); // Limpiar los datos del dashboard
    Swal.fire('¡Adiós!', 'Sesión cerrada', 'info'); // Mostrar notificación de cierre de sesión
  };

  // Función para obtener datos dinámicos del backend
  // Usa useCallback para memorizar la función y evitar re-renderizados innecesarios
  const obtenerDatosDinamicos = useCallback(async () => {
    if (!token) return; // No hacer la llamada si no hay token
    setLoading(true);
    setError('');
    try {
      // Calcular las fechas de inicio y fin del mes seleccionado
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Configurar parámetros y cabeceras para la solicitud GET
      const params = { startDate, endDate, groupBy: groupByOption };
      const config = { headers: { Authorization: `Bearer ${token}` }, params };

      // Realizar la solicitud GET al endpoint de datos dinámicos
      const response = await axios.get(`${API_BASE_URL}/dashboard/dynamic-data`, config);
      console.log("📊 Datos recibidos del backend:", response.data); // Log de los datos recibidos
      setDynamicData(response.data); // Actualizar el estado con los datos
    } catch (err) {
      // Capturar y mostrar errores al obtener los datos
      const errorMessage = err.response?.data?.message || 'Error al obtener datos dinámicos';
      setError(errorMessage);
      Swal.fire('Error', errorMessage, 'error');
    } finally {
      setLoading(false); // Desactivar el estado de carga
    }
  }, [token, selectedYear, selectedMonth, groupByOption]); // Dependencias de useCallback

  // useEffect para llamar a obtenerDatosDinamicos cuando cambian las dependencias
  useEffect(() => {
    if (token) obtenerDatosDinamicos();
  }, [token, obtenerDatosDinamicos]);

  // Función para procesar los datos crudos del backend en un formato apto para Chart.js
  const processChartData = (rawData, groupByField) => {
    // Extraer la clave del campo de agrupación (ej. 'categoria_producto', 'nombre_tienda', 'genero')
    const fieldKey = groupByField.includes('.') ? groupByField.split('.').pop() : groupByField;

    const labels = [];
    const values = [];
    const backgroundColors = [];
    const borderColors = [];
    const hoverBackgroundColors = [];

    rawData.forEach((item, index) => {
      // 1. Validar y limpiar el label (nombre de la categoría, tienda, género, etc.)
      const label = item[fieldKey]?.toString().trim() || `Item ${index}`;

      // 2. Extraer y convertir total_metrica a número
      // Se asume que total_metrica es el valor numérico para el gráfico (ej. ventas, conteo)
      const rawValue = item.total_metrica?.toString().trim();
      const cleanValue = parseFloat(rawValue.replace(/[^\d.-]/g, '')) || 0;

      if (!label || isNaN(cleanValue)) {
        console.error(`❌ Dato inválido en fila ${index}:`, item);
      } else {
        labels.push(label);
        values.push(cleanValue);
        
        // Asignar colores de la paleta de forma cíclica
        const colorIndex = index % COLORS.length;
        backgroundColors.push(COLORS[colorIndex]);
        // Borde más oscuro para el color de fondo
        borderColors.push(COLORS[colorIndex].replace('0.6', '1')); 
        // Color de hover ligeramente más claro
        hoverBackgroundColors.push(`${COLORS[colorIndex]}CC`); 
      }
    });

    // Retorna el objeto de datos para Chart.js
    return {
      labels,
      datasets: [{
        label: 'Ventas Totales', // Etiqueta genérica para los datasets
        data: values,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 2,
        borderRadius: 6, // Para barras redondeadas (aunque no se aplica a Pie)
        hoverBackgroundColor: hoverBackgroundColors,
        hoverBorderWidth: 3,
        fill: false, // Importante para gráficos de línea para no rellenar el área
        tension: 0.1 // Curvatura de la línea
      }],
    };
  };

  // Memorizar los datos del gráfico para evitar cálculos innecesarios en cada render
  const chartData = useMemo(() => processChartData(dynamicData, groupByOption), [dynamicData, groupByOption]);

  // Opciones generales para todos los gráficos
  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { 
        position: 'top', // Posición de la leyenda
        labels: {
          font: {
            size: 14,
            family: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif"
          },
          padding: 20,
          usePointStyle: true, // Usar puntos en lugar de cuadrados para la leyenda
        }
      },
      tooltip: {
        callbacks: {
          // Formatear el valor del tooltip como moneda MXN
          label: (context) => {
            const value = context.parsed.y || context.parsed; // Para Line y Bar es .y, para Pie es directo
            return new Intl.NumberFormat('es-MX', { 
              style: 'currency', 
              currency: 'MXN',
              minimumFractionDigits: 2
            }).format(value);
          }
        },
        displayColors: true,
        backgroundColor: 'rgba(0,0,0,0.8)',
        titleFont: { size: 16 },
        bodyFont: { size: 14 },
        padding: 12,
        cornerRadius: 8
      }
    },
    // Las escalas se definirán específicamente para Bar y Line. Para Pie se omiten.
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)', // Color de las líneas de la cuadrícula
        },
        ticks: {
          // Formatear los ticks del eje Y como moneda MXN sin decimales
          callback: (value) => {
            return new Intl.NumberFormat('es-MX', { 
              style: 'currency', 
              currency: 'MXN',
              maximumFractionDigits: 0
            }).format(value);
          }
        }
      },
      x: {
        grid: {
          display: false // Ocultar las líneas de la cuadrícula del eje X
        }
      }
    },
    animation: {
      duration: 1000, // Duración de la animación
      easing: 'easeOutQuart' // Tipo de easing para la animación
    },
    maintainAspectRatio: false // Permite que el gráfico se ajuste al tamaño del contenedor
  };

  // Si no hay token, mostrar el formulario de login
  if (!token) {
    return (
      <div className="login-container">
        <h2>Inicio de Sesión</h2>
        <form onSubmit={handleLogin} className="login-form">
          <input 
            type="text" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            placeholder="Usuario" 
            required 
          />
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            placeholder="Contraseña" 
            required 
          />
          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Cargando...' : 'Iniciar Sesión'}
          </button>
          {error && <p className="error-message">{error}</p>}
        </form>
      </div>
    );
  }

  // Si hay token, mostrar el dashboard
  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Dashboard Analítico</h1>
        <button onClick={handleLogout} className="logout-button">Cerrar Sesión</button>
      </header>
      
      <div className="controls-container">
        <div className="control-group">
          <label>Año:</label>
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="custom-select"
          >
            {years.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
        
        <div className="control-group">
          <label>Mes:</label>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="custom-select"
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>
                {m.label.charAt(0).toUpperCase() + m.label.slice(1)} {/* Capitalizar la primera letra */}
              </option>
            ))}
          </select>
        </div>
        
        <div className="control-group">
          <label>Agrupar por:</label>
          <select 
            value={groupByOption} 
            onChange={(e) => setGroupByOption(e.target.value)}
            className="custom-select"
          >
            <option value="dp.categoria_producto">Categoría Producto</option>
            <option value="dt.nombre_tienda">Tienda</option>
            <option value="dc.genero">Género</option>
            <option value="dcal.nombre_mes">Mes</option>
          </select>
        </div>

        {/* Nuevo control para seleccionar el tipo de gráfico */}
        <div className="control-group">
          <label>Tipo de Gráfico:</label>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value)}
            className="custom-select"
          >
            <option value="pie">Pastel</option>
            <option value="bar">Barras</option>
            <option value="line">Línea</option>
            <option value="table">Tabla</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Cargando datos...</p>
        </div>
      ) : (
        <div className="charts-grid">
          {/* Renderizado condicional basado en el tipo de gráfico seleccionado */}
          {chartType === 'pie' && (
            <div className="chart-container">
              <h2>Distribución por {groupByOption.split('.').pop().replace('_', ' ')}</h2>
              <div className="chart-wrapper">
                <Pie 
                  data={chartData} 
                  options={{
                    ...chartOptions,
                    scales: {}, // Los gráficos de pastel no usan escalas x/y
                    plugins: {
                      ...chartOptions.plugins,
                      legend: {
                        ...chartOptions.plugins.legend,
                        position: 'right' // Leyenda a la derecha para el pastel
                      }
                    }
                  }}
                />
              </div>
            </div>
          )}

          {chartType === 'bar' && (
            <div className="chart-container">
              <h2>Ventas por {groupByOption.split('.').pop().replace('_', ' ')}</h2>
              <div className="chart-wrapper">
                <Bar data={chartData} options={chartOptions} />
              </div>
            </div>
          )}

          {chartType === 'line' && (
            <div className="chart-container">
              <h2>Tendencia de Ventas por {groupByOption.split('.').pop().replace('_', ' ')}</h2>
              <div className="chart-wrapper">
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
          )}

          {chartType === 'table' && (
            <div className="table-container chart-container"> {/* Reutilizamos chart-container para el estilo */}
              <h2>Detalle de Datos por {groupByOption.split('.').pop().replace('_', ' ')}</h2>
              {dynamicData.length > 0 ? (
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        {/* Genera las cabeceras de la tabla dinámicamente */}
                        {Object.keys(dynamicData[0]).map(key => (
                          <th key={key} className="px-4 py-2 text-left text-gray-600 uppercase font-semibold">
                            {key.replace('_', ' ').charAt(0).toUpperCase() + key.replace('_', ' ').slice(1)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Renderiza las filas de la tabla */}
                      {dynamicData.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-gray-200 hover:bg-gray-50">
                          {Object.values(row).map((value, colIndex) => (
                            <td key={colIndex} className="px-4 py-2 whitespace-nowrap">
                              {/* Formatea los valores numéricos como moneda si es necesario */}
                              {typeof value === 'number' 
                                ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value) 
                                : value}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-gray-500 mt-4">No hay datos disponibles para mostrar en la tabla.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;