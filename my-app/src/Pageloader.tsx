import "./PageLoader.css";

interface PageLoaderProps {
  message?: string;
}

function PageLoader({ message = "Loading..." }: PageLoaderProps) {
  return (
    <div className="page-loader">
      <div className="loader-content">
        <div className="loader-ring-wrapper">
          <div className="loader-ring outer" />
          <div className="loader-ring middle" />
          <div className="loader-ring inner" />
          <div className="loader-icon">🔐</div>
        </div>
        <p className="loader-message">{message}</p>
        <div className="loader-dots">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}

export default PageLoader;