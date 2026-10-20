package me.samulsz.musicapi.services;

import me.samulsz.musicapi.controllers.AdminImportPriorityController;
import me.samulsz.musicapi.repositories.CatalogImportPriorityRepository;
import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class ImportPriorityFilterTests {
    @Test void userRequestsAreSeparatedFromLegacyQueueAndRespectCutoff() {
        var repo = mock(CatalogImportPriorityRepository.class);
        var auth = mock(AdminSessionService.class);
        when(auth.validateToken("token")).thenReturn(true);
        var controller = new AdminImportPriorityController(repo, auth);
        assertEquals(200, controller.list("token", 50, true, 1234).getStatusCode().value());
        verify(repo).findByStatusAndReasonAndCreatedAtGreaterThanEqualOrderByPriorityDescCreatedAtAsc(eq("PENDING"), eq("Playlist importada por usuário"), eq(1234L), any());
        verify(repo, never()).findByStatusOrderByPriorityDescCreatedAtAsc(any(), any());
    }
    @Test void unauthenticatedRequestsCannotReadQueue() {
        var repo = mock(CatalogImportPriorityRepository.class);
        var controller = new AdminImportPriorityController(repo, mock(AdminSessionService.class));
        assertEquals(401, controller.list("invalid", 50, true, 0).getStatusCode().value());
        verifyNoInteractions(repo);
    }
}
