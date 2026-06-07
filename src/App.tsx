import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Terminal, Send } from 'lucide-react';
import './index.css';

interface LogMessage {
  time: string;
  content: string;
  isSystem?: boolean;
}

function App() {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Conectar al servidor de producción
    socketRef.current = io('https://ser-150317434723.europe-west1.run.app');

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      addLog('Sistema conectado a la Fábrica de Software.', true);
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      setIsWorking(false);
      addLog('Conexión perdida. Intentando reconectar...', true);
    });

    // Escuchar logs de los agentes
    socketRef.current.on('agent_log', (logStr: string) => {
      addLog(logStr);
      // Heurística simple para saber si terminaron
      if (logStr.includes('CODER_COMPLETADO') || logStr.includes('DEVOPS_COMPLETADO') || logStr.includes('REVISION_APROBADA')) {
        setIsWorking(false);
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    // Auto-scroll hacia abajo
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (content: string, isSystem: boolean = false) => {
    const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs((prev) => [...prev, { time, content, isSystem }]);
  };

  const handleSend = () => {
    if (!input.trim() || !socketRef.current) return;
    
    addLog(`> ${input}`, true);
    socketRef.current.emit('run_orchestrator', { prompt: input });
    setIsWorking(true);
    setInput('');
  };

  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <div className="header-title">
          <Terminal size={32} color="var(--neon-green)" />
          <div className="title-text">
            <span className="title-main">KODU Code</span>
            <span className="title-sub">Sitios web y apps AI Factory</span>
          </div>
        </div>
        <div className="status-badge" style={{ borderColor: isWorking ? 'var(--neon-green)' : '#555', color: isWorking ? 'var(--neon-green)' : '#555' }}>
          <div className="status-dot" style={{ backgroundColor: isWorking ? 'var(--neon-green)' : '#555', boxShadow: isWorking ? '0 0 8px var(--neon-green)' : 'none', animation: isWorking ? 'pulse 1.5s infinite alternate' : 'none' }}></div>
          {isWorking ? 'WORKING' : (isConnected ? 'IDLE' : 'OFFLINE')}
        </div>
      </div>

      <div className="logs-container">
        {logs.map((log, i) => (
          <div key={i} className="log-entry">
            <span className="log-time">[{log.time}]</span>
            <span className={`log-content ${log.isSystem ? 'system' : ''}`}>
              {log.content}
            </span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      <div className="input-container">
        <input 
          type="text" 
          className="prompt-input"
          placeholder="Describe la app que quieres crear..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={!isConnected || isWorking}
        />
        <button 
          className="send-btn"
          onClick={handleSend}
          disabled={!isConnected || isWorking}
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
}

export default App;
