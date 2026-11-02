-- Module pâte (02/11/2026, Paul) : le mélange de la biga passe à 2 min (procédure et minuteur par défaut).
update public.recipes set procedure = replace(procedure, 'mélanger 3 min en marche arrière', 'mélanger 2 min en marche arrière') where type = 'biga';
