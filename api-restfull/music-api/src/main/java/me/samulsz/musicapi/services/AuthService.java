package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.AuthRequest;
import me.samulsz.musicapi.dto.AuthResponse;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.UserRepository;
import me.samulsz.musicapi.security.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtUtil jwtUtil;

    public AuthResponse register(AuthRequest request) {
        if (request.getUsername() == null || request.getUsername().trim().length() < 3) {
            throw new RuntimeException("O nome de usuário deve ter pelo menos 3 caracteres.");
        }
        if (request.getPassword() == null || request.getPassword().length() < 6) {
            throw new RuntimeException("A senha deve ter pelo menos 6 caracteres.");
        }

        String username = request.getUsername().trim();
        if (userRepository.findByUsername(username).isPresent()) {
            throw new RuntimeException("Este usuário já existe!");
        }

        User newUser = new User();
        newUser.setUsername(username);
        newUser.setPassword(passwordEncoder.encode(request.getPassword()));

        User savedUser = userRepository.save(newUser);
        String token = jwtUtil.generateToken(savedUser.getUsername());
        return new AuthResponse(token, savedUser.getUsername(), savedUser.getDownloadedSongs());
    }

    public AuthResponse login(AuthRequest request) {
        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado!"));
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new RuntimeException("Senha incorreta!");
        }

        String token = jwtUtil.generateToken(user.getUsername());

        return new AuthResponse(token, user.getUsername(), user.getDownloadedSongs());
    }
}
