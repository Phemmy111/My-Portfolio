(function () {
  // Prevent duplicate injection
  if (window.__obey_widget_loaded) return;
  window.__obey_widget_loaded = true;

  // Extract configuration from current script tag
  var currentScript = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var workspaceSlug = currentScript ? (currentScript.getAttribute('data-workspace') || 'autolearn-spot') : 'autolearn-spot';
  var host = currentScript && currentScript.src ? new URL(currentScript.src).origin : 'https://obeyai.vercel.app';

  // Inject floating iframe container
  var container = document.createElement('div');
  container.id = 'obey-web-widget-container';
  container.style.position = 'fixed';
  container.style.bottom = '20px';
  container.style.right = '20px';
  container.style.zIndex = '999999';
  container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // Toggle button
  var button = document.createElement('button');
  button.id = 'obey-web-widget-button';
  button.innerHTML = '💬';
  button.style.width = '56px';
  button.style.height = '56px';
  button.style.borderRadius = '50%';
  button.style.backgroundColor = '#10b981';
  button.style.color = '#000000';
  button.style.fontSize = '24px';
  button.style.border = 'none';
  button.style.boxShadow = '0 10px 25px -5px rgba(16, 185, 129, 0.4)';
  button.style.cursor = 'pointer';
  button.style.display = 'flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.transition = 'transform 0.2s ease';

  button.onmouseenter = function () { button.style.transform = 'scale(1.08)'; };
  button.onmouseleave = function () { button.style.transform = 'scale(1)'; };

  // Modal Frame
  var frame = document.createElement('iframe');
  frame.id = 'obey-web-widget-frame';
  frame.src = host + '/workspace/' + encodeURIComponent(workspaceSlug) + '?embed=true';
  frame.style.width = '380px';
  frame.style.height = '580px';
  frame.style.maxWidth = 'calc(100vw - 40px)';
  frame.style.maxHeight = 'calc(100vh - 100px)';
  frame.style.border = '1px solid rgba(255, 255, 255, 0.15)';
  frame.style.borderRadius = '16px';
  frame.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.5)';
  frame.style.display = 'none';
  frame.style.marginBottom = '12px';
  frame.style.backgroundColor = '#020617';

  button.onclick = function () {
    if (frame.style.display === 'none') {
      frame.style.display = 'block';
      button.innerHTML = '✕';
    } else {
      frame.style.display = 'none';
      button.innerHTML = '💬';
    }
  };

  container.appendChild(frame);
  container.appendChild(button);
  document.body.appendChild(container);
})();
