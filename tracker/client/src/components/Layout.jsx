import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import AiAssistantPanel from './AiAssistantPanel.jsx';
import FeedbackBubble from './FeedbackBubble.jsx';

export default function Layout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-content">
        <Outlet />
      </main>
      <AiAssistantPanel />
      <FeedbackBubble />
    </div>
  );
}
