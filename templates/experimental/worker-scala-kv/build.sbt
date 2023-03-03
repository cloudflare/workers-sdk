enablePlugins(ScalaJSPlugin)

scalaVersion := "2.13.3"

libraryDependencies ++= Seq(
  "org.scala-js" %% "scalajs-library" % "1.1.0",
  "org.scala-js" %%% "scalajs-dom" % "1.0.0"
)

scalaJSUseMainModuleInitializer := true

Compile / fullOptJS / artifactPath := baseDirectory.value / "index.js"
