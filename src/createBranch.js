Aha.on("createBranch", function (args) {
  console.log("createBranch");
  console.log("Got args:");
  console.log(args);

  const notAuthenticated = true;
  if (notAuthenticated) {
    Aha.respondWithRedirect("/auth");
    return;
  }
});
