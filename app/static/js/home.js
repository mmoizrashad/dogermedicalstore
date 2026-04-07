function handleLogin(role) {

    sessionStorage.setItem('selectedRole', role);
    window.location.href = `/signin`;
}

window.handleLogin = handleLogin;
function showSection(id) {
    
    document.getElementById('about').style.display = 'none';
    document.getElementById('help').style.display = 'none';

    document.getElementById(id).style.display = 'block';

    
    document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
}

window.showSection = showSection;
